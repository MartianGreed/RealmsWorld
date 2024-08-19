// TODO: fix types
/* eslint-disable @typescript-eslint/no-unsafe-assignment,  @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call  */
import { BASIC_CHOICES } from "@/data/constants";
import type { NetworkApi, PaginationOpts, SpacesFilter } from "@/lib/network/types";
import { getNames } from "@/lib/stamp";
import type {
  Follow,
  JSONStringSpaceMetadataDelegation,
  Leaderboard,
  NetworkID,
  Proposal,
  ProposalState,
  Space,
  SpaceMetadataDelegation,
  SpaceMetadataTreasury,
  Transaction,
  User,
  Vote,
} from "@/types";
import {
  ApolloClient,
  createHttpLink,
  InMemoryCache,
} from "@apollo/client/core";

import type {
  HighlighProposalQueryResult,
  HighlighProposalsQueryResult,
  HighlighSpaceQueryResult,
  HighlighSpacesQueryResult,
  HighlightProposal,
  HighlightUserQueryResult
} from "./highlight";
import {
  PROPOSAL_QUERY as HIGHLIGHT_PROPOSAL_QUERY,
  PROPOSALS_QUERY as HIGHLIGHT_PROPOSALS_QUERY,
  SPACE_QUERY as HIGHLIGHT_SPACE_QUERY,
  SPACES_QUERY as HIGHLIGHT_SPACES_QUERY,
  USER_QUERY as HIGHLIGHT_USER_QUERY,
  VOTES_QUERY as HIGHLIGHT_VOTES_QUERY,
  joinHighlightProposal,
  joinHighlightSpace,
  joinHighlightUser,
  mixinHighlightVotes,
} from "./highlight";
import type {
  LeaderboardQueryResult,
  ProposalQueryResult,
  ProposalsQueryResult,
  SpaceQueryResult,
  SpacesQueryResult,
  UserQueryResult,
  VotesQueryResult
} from "./queries";
import {
  LEADERBOARD_QUERY,
  PROPOSAL_QUERY,
  PROPOSALS_QUERY,
  SPACE_QUERY,
  SPACES_QUERY,
  USER_QUERY,
  USER_VOTES_QUERY,
  VOTES_QUERY
} from "./queries";
import type { ApiProposal, ApiSpace, ApiStrategyParsedMetadata } from "./types";

interface ApiOptions {
  highlightApiUrl?: string;
}

function getProposalState(
  proposal: ApiProposal,
  current: number,
): ProposalState {
  if (proposal.executed) return "executed";
  if (proposal.max_end <= current) {
    if (proposal.scores_total < proposal.quorum) return "rejected";
    return proposal.scores_1 > proposal.scores_2 ? "passed" : "rejected";
  }
  if (proposal.start > current) return "pending";

  return "active";
}

function formatExecution(execution: string): Transaction[] {
  if (execution === "") return [];

  try {
    const result = JSON.parse(execution) as Transaction[];

    return Array.isArray(result) ? result : [];
  } catch (e) {
    console.log(`Failed to parse execution ${e as string}`);
    return [];
  }
}

function processStrategiesMetadata(
  parsedMetadata: ApiStrategyParsedMetadata[],
  strategiesIndicies?: number[],
) {
  if (parsedMetadata.length === 0) return [];

  const maxIndex = Math.max(
    ...parsedMetadata.map((metadata) => metadata.index),
  );

  const metadataMap = Object.fromEntries(
    parsedMetadata.map((metadata) => [
      metadata.index,
      {
        name: metadata.data.name,
        description: metadata.data.description,
        decimals: metadata.data.decimals,
        symbol: metadata.data.symbol,
        token: metadata.data.token,
        payload: metadata.data.payload,
      },
    ]),
  );

  strategiesIndicies =
    strategiesIndicies ?? Array.from(Array(maxIndex + 1).keys());
  return strategiesIndicies.map((index) => metadataMap[index]);
}

function formatSpace(space: ApiSpace, networkId: NetworkID): Space {
  return {
    ...space,
    network: networkId,
    verified: false,
    turbo: false,
    name: space.metadata.name,
    avatar: space.metadata.avatar,
    cover: space.metadata.cover,
    about: space.metadata.about,
    external_url: space.metadata.external_url,
    github: space.metadata.github,
    twitter: space.metadata.twitter,
    discord: space.metadata.discord,
    voting_power_symbol: space.metadata.voting_power_symbol,
    treasuries: space.metadata.treasuries.map((treasury) => {
      const { name, network, address } = JSON.parse(treasury) as SpaceMetadataTreasury;

      return {
        name,
        network,
        address,
      };
    }),
    delegations: space.metadata.delegations.map((delegation) => {
      const { name, api_type, api_url, contract } = JSON.parse(delegation) as JSONStringSpaceMetadataDelegation;

      const [network, address] = contract.split(":");

      return {
        name: name,
        apiType: api_type,
        apiUrl: api_url,
        contractNetwork: network === "null" ? null : network,
        contractAddress: address === "null" ? null : address,
      } as SpaceMetadataDelegation;
    }),
    executors: space.metadata.executors,
    executors_types: space.metadata.executors_types,
    executors_destinations: space.metadata.executors_destinations,
    executors_strategies: space.metadata.executors_strategies,
    //@ts-expect-error undefined
    voting_power_validation_strategies_parsed_metadata:
      processStrategiesMetadata(
        space.voting_power_validation_strategies_parsed_metadata,
      ),
    //@ts-expect-error undefined
    strategies_parsed_metadata: processStrategiesMetadata(
      space.strategies_parsed_metadata,
      space.strategies_indicies,
    ),
  };
}

function formatProposal(
  proposal: ApiProposal,
  networkId: NetworkID,
  current: number,
): Proposal {
  return {
    ...proposal,
    space: {
      id: proposal.space.id,
      name: proposal.space.metadata.name,
      avatar: proposal.space.metadata.avatar,
      controller: proposal.space.controller,
      authenticators: proposal.space.authenticators,
      voting_power_symbol: proposal.space.metadata.voting_power_symbol,
      executors: proposal.space.metadata.executors,
      executors_types: proposal.space.metadata.executors_types,
      //@ts-expect-error undefined
      strategies_parsed_metadata: processStrategiesMetadata(
        proposal.space.strategies_parsed_metadata,
        proposal.strategies_indicies,
      ),
    },
    metadata_uri: proposal.metadata.id,
    type: "basic",
    choices: BASIC_CHOICES,
    scores: [proposal.scores_1, proposal.scores_2, proposal.scores_3],
    title: proposal.metadata.title,
    body: proposal.metadata.body,
    discussion: proposal.metadata.discussion,
    execution: formatExecution(proposal.metadata.execution),
    has_execution_window_opened:
      proposal.execution_strategy_type === "Axiom"
        ? proposal.max_end <= current
        : proposal.min_end <= current,
    state: getProposalState(proposal, current),
    network: networkId,
    privacy: null,
    quorum: +proposal.quorum,
  };
}

export function createApi(
  uri: string,
  networkId: NetworkID,
  opts: ApiOptions = {},
): NetworkApi {
  const httpLink = createHttpLink({ uri });

  const apollo = new ApolloClient({
    link: httpLink,
    cache: new InMemoryCache({
      addTypename: false,
    }),
    defaultOptions: {
      query: {
        fetchPolicy: "no-cache",
      },
    },
  });

  const highlightApolloClient = opts.highlightApiUrl
    ? new ApolloClient({
      link: createHttpLink({ uri: opts.highlightApiUrl }),
      cache: new InMemoryCache({
        addTypename: false,
      }),
      defaultOptions: {
        query: {
          fetchPolicy: "no-cache",
        },
      },
    })
    : null;

  const highlightVotesCache = {
    key: null as string | null,
    data: [] as Vote[],
    remaining: [] as Vote[],
  };

  return {
    loadProposalVotes: async (
      proposal: Proposal,
      { limit, skip = 0 }: PaginationOpts,
      filter: "any" | "for" | "against" | "abstain" = "any",
      sortBy: "vp-desc" | "vp-asc" | "created-desc" | "created-asc" = "vp-desc",
    ): Promise<Vote[]> => {
      const filters: Record<string, string | number> = {};
      if (filter === "for") {
        filters.choice = 1;
      } else if (filter === "against") {
        filters.choice = 2;
      } else if (filter === "abstain") {
        filters.choice = 3;
      }

      const [orderBy, orderDirection] = sortBy.split("-") as [
        "vp" | "created",
        "desc" | "asc",
      ];

      const { data } = await apollo.query({
        query: VOTES_QUERY,
        variables: {
          first: limit,
          skip,
          orderBy,
          orderDirection,
          where: {
            space: proposal.space.id,
            proposal: proposal.proposal_id,
            ...filters,
          },
        },
      }) as VotesQueryResult;

      if (highlightApolloClient) {
        const cacheKey = `${proposal.space.id}/${proposal.proposal_id}`;
        const cacheValid = highlightVotesCache.key === cacheKey;

        if (!cacheValid) {
          const { data: highlightData } = await highlightApolloClient.query({
            query: HIGHLIGHT_VOTES_QUERY,
            variables: {
              space: proposal.space.id,
              proposal: proposal.proposal_id,
            },
          }) as VotesQueryResult;

          highlightVotesCache.key = cacheKey;
          highlightVotesCache.data = highlightData.votes;
          highlightVotesCache.remaining = highlightData.votes;
        } else if (skip === 0) {
          highlightVotesCache.remaining = highlightVotesCache.data;
        }

        const { result, remaining } = mixinHighlightVotes(
          data.votes,
          highlightVotesCache.remaining,
          filter,
          orderBy,
          orderDirection,
          limit,
        );

        highlightVotesCache.remaining = remaining;

        data.votes = result;
      }

      const addresses = data.votes.map(
        (vote: { voter: { id: string } }) => vote.voter.id,
      );
      const names = await getNames(addresses);

      return data.votes.map(
        (vote: Vote) => {
          vote.voter.name = names[vote.voter.id] ?? undefined;
          return vote;
        },
      );
    },
    loadUserVotes: async (
      spaceIds: string[],
      voter: string,
    ): Promise<Record<string, Vote>> => {
      const { data } = await apollo.query({
        query: USER_VOTES_QUERY,
        variables: {
          spaceIds,
          voter,
        },
      }) as VotesQueryResult;

      return Object.fromEntries(
        (data.votes).map((vote) => [
          `${networkId}:${vote.space.id}/${vote.proposal}`,
          vote,
        ]),
      );
    },
    loadProposals: async (
      spaceIds: string[],
      { limit, skip = 0 }: PaginationOpts,
      current: number,
      filter: "any" | "active" | "pending" | "closed" = "any",
      searchQuery = "",
    ): Promise<Proposal[]> => {
      const filters: Record<string, string | number> = {};
      if (filter === "active") {
        filters.start_lte = current;
        filters.max_end_gte = current;
      } else if (filter === "pending") {
        filters.start_gt = current;
      } else if (filter === "closed") {
        filters.max_end_lt = current;
      }

      const { data } = await apollo.query({
        query: PROPOSALS_QUERY,
        variables: {
          first: limit,
          skip,
          where: {
            space_in: spaceIds,
            cancelled: false,
            metadata_: { title_contains_nocase: searchQuery },
            ...filters,
          },
        },
      }) as ProposalsQueryResult;
      console.log(data);

      if (highlightApolloClient) {
        const { data: highlightData } = await highlightApolloClient.query({
          query: HIGHLIGHT_PROPOSALS_QUERY,
          variables: {
            ids: data.proposals.map((proposal: { id: string }) => proposal.id),
          },
        }) as HighlighProposalsQueryResult;

        data.proposals = data.proposals.map((proposal) => {
          // eslint-disable-next-line
          // @ts-ignore
          const highlightProposal = highlightData.sxproposals.find(
            (highlightProposal: HighlightProposal) => highlightProposal.id === proposal.id,
          );

          return joinHighlightProposal(proposal, highlightProposal ?? null);
        });
      }

      return data.proposals.map((proposal: ApiProposal) =>
        formatProposal(proposal, networkId, current),
      );
    },

    loadProposal: async (
      spaceId: string,
      proposalId: number,
      current: number,
    ): Promise<Proposal | null> => {
      const [{ data }, highlightResult] = await Promise.all([
        apollo.query<ProposalQueryResult>({
          query: PROPOSAL_QUERY,
          variables: { id: `${spaceId}/${proposalId}` },
        }),
        highlightApolloClient
          ?.query<HighlighProposalQueryResult>({
            query: HIGHLIGHT_PROPOSAL_QUERY,
            variables: { id: `${spaceId}/${proposalId}` },
          })
          .catch(() => null),
      ]);

      if (data.proposal.metadata === null) return null;
      data.proposal = joinHighlightProposal(
        data.proposal,
        highlightResult?.data.sxproposal,
      );

      return formatProposal(data.proposal, networkId, current);
    },
    loadSpaces: async (
      { limit, skip = 0 }: PaginationOpts,
      filter?: SpacesFilter,
    ): Promise<Space[]> => {
      const { data } = await apollo.query({
        query: SPACES_QUERY,
        variables: {
          first: limit,
          skip,
          where: {
            ...filter,
            metadata_: {},
          },
        },
      }) as SpacesQueryResult;

      if (highlightApolloClient) {
        const { data: highlightData } = await highlightApolloClient.query<HighlighSpacesQueryResult>({
          query: HIGHLIGHT_SPACES_QUERY,
          variables: { ids: data.spaces.map((space) => space.id) },
        });


        data.spaces = data.spaces.map((space: ApiSpace) => {
          const highlightSpace = highlightData.sxspaces.find(
            (highlightSpace) => highlightSpace.id === space.id,
          );

          return joinHighlightSpace(space, highlightSpace);
        });
      }

      // eslint-disable-next-line
      // @ts-ignore
      return data.spaces.map((space) => formatSpace(space, networkId));
    },
    loadSpace: async (id: string): Promise<Space | null> => {
      const [{ data }, highlightResult] = await Promise.all([
        apollo.query({
          query: SPACE_QUERY,
          variables: { id },
        }) as Promise<SpaceQueryResult>,
        highlightApolloClient
          ?.query({
            query: HIGHLIGHT_SPACE_QUERY,
            variables: { id },
          })
          .catch(() => null) as Promise<HighlighSpaceQueryResult | null>,
      ]);

      data.space = joinHighlightSpace(
        data.space,
        // eslint-disable-next-line
        // @ts-ignore
        highlightResult?.data.sxspace,
      );

      return formatSpace(data.space, networkId);
    },
    loadUser: async (id: string): Promise<User | null> => {

      const [{ data }, highlightResult] = await Promise.all([
        apollo.query({
          query: USER_QUERY,
          variables: { id },
        }) as Promise<UserQueryResult>,
        highlightApolloClient
          ?.query({
            query: HIGHLIGHT_USER_QUERY,
            variables: { id },
          })
          .catch(() => null) as Promise<HighlightUserQueryResult | null>,
      ]);

      return joinHighlightUser(
        data.user,
        highlightResult?.data.sxuser ?? null,
      );
    },
    loadLeaderboard(
      spaceId: string,
      { limit, skip = 0 }: PaginationOpts,
      sortBy:
        | "vote_count-desc"
        | "vote_count-asc"
        | "proposal_count-desc"
        | "proposal_count-asc" = "vote_count-desc",
    ): Promise<User[]> {
      const [orderBy, orderDirection] = sortBy.split("-") as [
        "vote_count" | "proposal_count",
        "desc" | "asc",
      ];

      return apollo
        .query({
          query: LEADERBOARD_QUERY,
          variables: {
            first: limit,
            skip,
            orderBy,
            orderDirection,
            where: {
              space: spaceId,
            },
          },
        })
        .then(({ data }: LeaderboardQueryResult) =>
          data.leaderboards.map((leaderboard: Leaderboard) => ({
            id: leaderboard.user.id,
            created: leaderboard.user.created,
            vote_count: leaderboard.vote_count,
            proposal_count: leaderboard.proposal_count,
          })),
        ) as Promise<User[]>;
    },
    // eslint-disable-next-line
    loadFollows: async () => {
      return [] as Follow[];
    },
  };
}
