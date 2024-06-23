import type { Call } from "starknet";
import { useMemo } from "react";
import ERC721ABI from "@/abi/L2/ERC721.json";
import {
  useContract,
  useSendTransaction as useL2ContractWrite,
} from "@starknet-react/core";
import { useAccount as useL1Account } from "wagmi";

export const useERC721Approval = ({
  contractAddress,
  operator,
}: {
  contractAddress: string;
  operator: string;
}) => {
  const { address: addressL1 } = useL1Account();

  const { contract } = useContract({
    abi: ERC721ABI,
    address: contractAddress as `0x${string}`,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const calls: Call[] = useMemo(() => {
    if (!contractAddress || !operator || !addressL1) return [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return [contract?.populate("set_approval_for_all", [operator, true])];
  }, [contractAddress, operator, addressL1, contract]);

  const { sendAsync, ...writeReturn } = useL2ContractWrite({ calls });

  return {
    calls,
    sendAsync,
    ...writeReturn,
  };
};
