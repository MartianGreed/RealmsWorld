import { CollectionCard } from "@/app/_components/CollectionCard";
import { SUPPORTED_L1_CHAIN_ID, SUPPORTED_L2_CHAIN_ID } from "@/constants/env";
import { api } from "@/trpc/server";

import { CollectionAddresses } from "@realms-world/constants";

import { getCollections } from "../../lib/reservoir/getCollections";
import { getCollections as getArkCollections } from "@/lib/ark/getCollection";
import { ArkMarketplaceClientFetch } from "@/lib/ark/client";
import type { Collection } from "@/types/ark";

export const metadata = {
  title: "Lootverse Collections",
  description:
    "Various collections of the Lootverse - Created for adventurers by Bibliotheca DAO",
};

export default async function CollectionsList() {
  const collectionAddress = CollectionAddresses.realms[SUPPORTED_L2_CHAIN_ID] as `0x${string}`;
  const { data: collection } = await getArkCollections({ client: ArkMarketplaceClientFetch, collectionAddress });

  const erc721Collections = await api.erc721Collections.all({});
  console.log(erc721Collections);

  const l2Collections = [
    {
      name: "Beasts",
      link: "beasts",
      image: "/collections/beasts.svg",
      marketplaceId: 2,
    },
    {
      name: "Golden Token",
      link: "goldentoken",
      image: "/collections/goldentoken.svg",
      marketplaceId: 1,
    },
    {
      name: "Blobert",
      link: "blobert",
      image: "/collections/blobert.svg",
      marketplaceId: 3,
    },
    {
      name: "Pixel Banners (for Adventurers)",
      link: "banners",
      image: "/collections/banners.svg",
      marketplaceId: 4,
    },
  ];

  return (
    <div className="grid w-full grid-cols-1 gap-6 px-4 sm:px-0">
      <CollectionCard
        price={collection.floor ?? 0}
        symbol={"LORDS"}
        name={collection.name}
        link={"/realms"}
        image={collection.image}
      />
      {erc721Collections.items.map((collection, index) => {
        const collectionInfo = l2Collections.find(
          (collectionInfo) =>
            collectionInfo.marketplaceId == collection.marketplaceId,
        );
        return (
          <CollectionCard
            name={collectionInfo?.name}
            price={collection.floorPrice}
            symbol={"LORDS"}
            image={collectionInfo?.image}
            link={collectionInfo?.link}
            key={index}
          />
        );
      })}
    </div>
  );
}
