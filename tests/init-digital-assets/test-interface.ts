import { PublicKey } from "@solana/web3.js";

export interface TestDigitalAsset {
    settlementOldMint: string;
    settlementOldAta: string;
    buyersettlementAta: string;
    settlementMint: string;
    settlementOwner: string;
    maketdestination: string;
    sellerDestination: string;
    digitalAssetInfo: DigitalAssetInfo[];
}

export interface DigitalAssetInfo {
    mint: string;
    metadata: string;
    sellerNftTokenAccount: string;
    buyerNftTokenAccount: string;
    name: string;
    Symbol: string;
    creatorsAta: string[];
    creators: string[];
}
