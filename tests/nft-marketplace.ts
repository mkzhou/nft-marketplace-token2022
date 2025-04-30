import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { NftMarketplace } from "../target/types/nft_marketplace";
import { Keypair, Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { getMint,getAccount, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";
import * as yaml from 'js-yaml';
import  dotenv from "dotenv";
import { TestDigitalAsset, DigitalAssetInfo } from "./init-digital-assets/test-interface";
import { airdropIfRequired, initializeKeypair } from "@solana-developers/helpers";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { expect } from "chai";
import { fetchDigitalAsset, fetchMetadata, mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { Umi } from "@metaplex-foundation/umi";
import { fromWeb3JsKeypair, fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { createSignerFromKeypair, signerIdentity } from '@metaplex-foundation/umi'
dotenv.config();

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe("nft-marketplace", () => {
  // Configure the client to use the local cluster.

  let provider: anchor.AnchorProvider;
  let wallet: anchor.Wallet;
  let program: Program<NftMarketplace>;
  let seller: Keypair;
  let payer: Keypair;
  let connection: Connection;
  let market: PublicKey;
  let collection: PublicKey;
  let oldescrow: PublicKey;
  let escrow: PublicKey;
  let devUser: Keypair;
  let nftVault_sellorder: PublicKey;
  let nftVault_buyorder_sellorder: PublicKey;
  let sellOrder: PublicKey;
  let sellOrderToMatchBuyOrder: PublicKey;
  let sellOrderToClose: PublicKey;
  let buyOrder: PublicKey;
  let buyOrderToMatchSellOrder: PublicKey;
  let buyOrderToClose: PublicKey;
  let umi: Umi;

  const KEYPAIR_FILE_FILE = 'my-keypair.json';

  const testKeyList = yaml.load(fs.readFileSync('test-key-list.yaml', 'utf8')) as TestDigitalAsset;
  const settlementOldMint = new PublicKey(testKeyList.settlementOldMint);
  const settlementOldAta = new PublicKey(testKeyList.settlementOldAta);
  const settlementMint = new PublicKey(testKeyList.settlementMint);
  const buyersettlementAta = new PublicKey(testKeyList.buyersettlementAta);
  const settlementOwner = new PublicKey(testKeyList.settlementOwner);
  const marketDestination = new PublicKey(testKeyList.maketdestination);
  const sellerDestination = new PublicKey(testKeyList.sellerDestination);
  const requiredVerifier = new PublicKey(testKeyList.digitalAssetInfo[0].creators[1]);
  const metadata_sellorder = new PublicKey(testKeyList.digitalAssetInfo[0].metadata);
  const nftMint_sellorder = new PublicKey(testKeyList.digitalAssetInfo[0].mint);
  const sellerNftTokenAccount_sellorder = new PublicKey(testKeyList.digitalAssetInfo[0].sellerNftTokenAccount);
  const buyerNftTokenAccount_sellorder = new PublicKey(testKeyList.digitalAssetInfo[0].buyerNftTokenAccount);
  const creatorsAtaList_sellorder = testKeyList.digitalAssetInfo[0].creatorsAta;
  const metadata_buyorder = new PublicKey(testKeyList.digitalAssetInfo[1].metadata);
  const nftMint_buyorder = new PublicKey(testKeyList.digitalAssetInfo[1].mint);
  const buyerNftTokenAccount_buyorder = new PublicKey(testKeyList.digitalAssetInfo[1].buyerNftTokenAccount);
  const sellerNftTokenAccount_buyorder = new PublicKey(testKeyList.digitalAssetInfo[1].sellerNftTokenAccount);
  const creatorsAtaList_buyorder = testKeyList.digitalAssetInfo[1].creatorsAta;
  const metadata_buyorder_sellorder = new PublicKey(testKeyList.digitalAssetInfo[2].metadata);
  const nftMint_buyorder_sellorder = new PublicKey(testKeyList.digitalAssetInfo[2].mint);
  const buyerNftTokenAccount_buyorder_sellorder = new PublicKey(testKeyList.digitalAssetInfo[2].buyerNftTokenAccount);
  const sellerNftTokenAccount_buyorder_sellorder = new PublicKey(testKeyList.digitalAssetInfo[2].sellerNftTokenAccount);
  const creatorsAtaList_buyorder_sellorder = testKeyList.digitalAssetInfo[2].creatorsAta;


  const MARKET_SEED = "market";
  const ESCROW_SEED = "escrow";
  const COLLECTION_SEED = "collection";
  const NFT_VAULT_SEED = "nft_vault";
  const SELL_ORDER_SEED = "sell_order";
  const BUY_ORDER_SEED = "buy_order";

  const collectionName = "bernese";
  const collectionSymbol = "bernese";

  async function trackSaleInfo(trackInfo: string): Promise<any>{
    const sellOrderAccount = await program.account.sellOrder.fetch(sellOrder, 'confirmed');
    const sellerNftTokenAccount = await getAccount(connection, sellerNftTokenAccount_sellorder, 'confirmed');
    const buyerNftTokenAccount = await getAccount(connection, buyerNftTokenAccount_sellorder, 'confirmed');
    const nftVault = await getAccount(connection, nftVault_sellorder, 'confirmed');
    const sellerDestinationAccount = await getAccount(connection, sellerDestination, 'confirmed');
    const buyerPayAccount = await getAccount(connection, buyersettlementAta, 'confirmed');
    const marketDestinationAccount = await getAccount(connection, marketDestination, 'confirmed');

    console.log(`${trackInfo} sellOrderAccount: ${sellOrderAccount.isSold}`);
    console.log(`${trackInfo} sellerNftTokenAccount: ${sellerNftTokenAccount.amount}`);
    console.log(`${trackInfo} buyerNftTokenAccount: ${buyerNftTokenAccount.amount}`);
    console.log(`${trackInfo} nftVault: ${nftVault.amount}`);
    console.log(`${trackInfo} sellerDestinationAccount: ${sellerDestinationAccount.amount}`);
    console.log(`${trackInfo} buyerPayAccount: ${buyerPayAccount.amount}`);
    console.log(`${trackInfo} marketDestinationAccount: ${marketDestinationAccount.amount}`);
    
    const creatorsAtaListInfo = await Promise.all(creatorsAtaList_sellorder.map(async (creatorAta) => {
      const creatorAtaPK = new PublicKey(creatorAta);
      const creatorAtaAccountInfo = await getAccount(connection, creatorAtaPK, 'confirmed');
      console.log("creatorAtaAccount: ", creatorAtaAccountInfo.amount);
      return creatorAtaAccountInfo;
    }));

    const creatorsAtaListInfoAmount = BigInt(creatorsAtaListInfo.reduce((acc, curr) => acc.add(new BN(curr.amount.toString())), new BN(0)).toNumber());
    console.log(`${trackInfo} summary the creators fee : ${creatorsAtaListInfoAmount}`);
    return {
      sellOrderAccount,
      sellerNftTokenAccount,
      buyerNftTokenAccount,
      nftVault,
      sellerDestinationAccount,
      buyerPayAccount,
      marketDestinationAccount,
      creatorsAtaListInfo,
      creatorsAtaListInfoAmount
    }
  }


  async function trackMatchBuyInfo(
    trackInfo: string, 
    buy_order: PublicKey,
    nft_token_account: PublicKey, 
    buyerNftToken: PublicKey,
    creatorsAtaList: string[]
  ): Promise<any>{
    const buyOrderAccount = await program.account.buyOrder.fetch(buy_order, 'confirmed');
    const sellerNftTokenAccount = await getAccount(connection, nft_token_account, 'confirmed');
    const buyerNftTokenAccount = await getAccount(connection, buyerNftToken, 'confirmed');
    const escrowAccount = await getAccount(connection, escrow, 'confirmed');
    const sellerDestinationAccount = await getAccount(connection, sellerDestination, 'confirmed');
    const buyerPayAccount = await getAccount(connection, buyersettlementAta, 'confirmed');
    const marketDestinationAccount = await getAccount(connection, marketDestination, 'confirmed');

    console.log(`${trackInfo} buyOrderAccount: ${buyOrderAccount.isBought}`);
    console.log(`${trackInfo} sellerNftTokenAccount: ${sellerNftTokenAccount.amount}`);
    console.log(`${trackInfo} buyerNftTokenAccount: ${buyerNftTokenAccount.amount}`);
    console.log(`${trackInfo} escrowAccount: ${escrowAccount.amount}`);
    console.log(`${trackInfo} sellerDestinationAccount: ${sellerDestinationAccount.amount}`);
    console.log(`${trackInfo} buyerPayAccount: ${buyerPayAccount.amount}`);
    console.log(`${trackInfo} marketDestinationAccount: ${marketDestinationAccount.amount}`);
    
    const creatorsAtaListInfo = await Promise.all(creatorsAtaList.map(async (creatorAta) => {
      const creatorAtaPK = new PublicKey(creatorAta);
      const creatorAtaAccountInfo = await getAccount(connection, creatorAtaPK, 'confirmed');
      console.log(`${trackInfo} creatorAtaAccount: ${creatorAtaAccountInfo.amount}`);
      return creatorAtaAccountInfo;
    }));

    const creatorsAtaListInfoAmount = BigInt(creatorsAtaListInfo.reduce((acc, curr) => acc.add(new BN(curr.amount.toString())), new BN(0)).toNumber());
    console.log(`${trackInfo} summary the creators fee : ${creatorsAtaListInfoAmount}`);
    return {
      buyOrderAccount,
      sellerNftTokenAccount,
      buyerNftTokenAccount,
      escrowAccount,
      sellerDestinationAccount,
      buyerPayAccount,
      marketDestinationAccount,
      creatorsAtaListInfo,
      creatorsAtaListInfoAmount
    }
  }

  async function matchBuyOrder(
    buy_order: PublicKey,
    nft_token_account: PublicKey, 
    nftMint: PublicKey, 
    buyerNftTokenAccount: PublicKey, 
    metadata: PublicKey, 
    sell_order: PublicKey,
    creatorsAtaList: string[]
  ): Promise<anchor.BN>{
    const trackMatchBuyInfoBefore = await trackMatchBuyInfo(
      "before match buy order ", 
      buy_order,
      nft_token_account,
      buyerNftTokenAccount,
      creatorsAtaList
    );

    const settlementMintInfo = await getMint(connection, settlementMint);
    const settlementDecimals = settlementMintInfo.decimals;

    const buyOrderAccount = await program.account.buyOrder.fetch(buy_order, 'confirmed');
    const nftPrice = buyOrderAccount.pricePosition;
    const collectionAccount = await program.account.collection.fetch(collection, 'confirmed');
    const feeBasisPoints = new BN(collectionAccount.feeBasisPoints);
    const marketFee = nftPrice.mul(feeBasisPoints).mul(new BN(Math.pow(10, settlementDecimals))).div(new BN(10000));

    const metadataInfo = await fetchMetadata(umi, fromWeb3JsPublicKey(metadata_sellorder));
    const creatorsFee = nftPrice.mul(new BN(metadataInfo.sellerFeeBasisPoints)).mul(new BN(Math.pow(10, settlementDecimals))).div(new BN(10000));
   
    const sellerFee = nftPrice.mul(new BN(Math.pow(10, settlementDecimals))).sub(creatorsFee).sub(marketFee);

    console.log("marketFeeBasisPoints: ", feeBasisPoints.toNumber());
    console.log("sellerFeeBasisPoints: ", metadataInfo.sellerFeeBasisPoints);
    console.log("--calculate--marketFee: ", marketFee.toNumber());
    console.log("--calculate--creatorsFee: ", creatorsFee.toNumber());
    console.log("--calculate--sellerFee: ", sellerFee.toNumber());

    let nftTokenAccountRemainingAccounts =  {
        pubkey: nft_token_account,
        isWritable: true,
        isSigner: false,
      };

    const creatorsRemainingAccounts = creatorsAtaList.map((creatorAta) => {
      return {
        pubkey: new PublicKey(creatorAta),
        isWritable: true,
        isSigner: false,
      }
    })
    const remainingAccounts = [nftTokenAccountRemainingAccounts, ...creatorsRemainingAccounts];
    if (sell_order) {
      remainingAccounts.push({
        pubkey: sell_order,
        isWritable: true,
        isSigner: false,
      })
    }

    const tx = await program.methods.matchBuyOrder().accounts({
      seller: seller.publicKey,
      market: market,
      collection: collection,
      marketDestination: marketDestination,
      buyOrder: buy_order,
      nftMint: nftMint,
      settlementMint: settlementMint,
      buyerNftTokenAccount: buyerNftTokenAccount,
      escrow: escrow,
      sellerDestination: sellerDestination,
      metadata: metadata,
      paidTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).remainingAccounts(remainingAccounts).signers([seller]).rpc({  
      commitment: 'confirmed',
    });

    const trackMatchBuyInfoAfter = await trackMatchBuyInfo(
      "after match buy order ", 
      buy_order,
      nft_token_account, 
      buyerNftTokenAccount, 
      creatorsAtaList); 
    
    const diffSellerNftTokenAccount = trackMatchBuyInfoBefore.sellerNftTokenAccount.amount - (trackMatchBuyInfoAfter.sellerNftTokenAccount.amount);
    const diffBuyerNftTokenAccount = trackMatchBuyInfoAfter.buyerNftTokenAccount.amount - (trackMatchBuyInfoBefore.buyerNftTokenAccount.amount);
    const diffEscrowAccount = trackMatchBuyInfoBefore.escrowAccount.amount - (trackMatchBuyInfoAfter.escrowAccount.amount);
    const diffSellerDestinationAccount = trackMatchBuyInfoAfter.sellerDestinationAccount.amount - (trackMatchBuyInfoBefore.sellerDestinationAccount.amount);
    const diffBuyerPayAccount = trackMatchBuyInfoBefore.buyerPayAccount.amount - (trackMatchBuyInfoAfter.buyerPayAccount.amount);
    const diffMarketDestinationAccount = trackMatchBuyInfoAfter.marketDestinationAccount.amount - (trackMatchBuyInfoBefore.marketDestinationAccount.amount);
    const diffCreatorsAtaListInfoAmount = trackMatchBuyInfoAfter.creatorsAtaListInfoAmount - (trackMatchBuyInfoBefore.creatorsAtaListInfoAmount);
    
    console.log("diffSellerNftTokenAccount: ", diffSellerNftTokenAccount);
    console.log("diffBuyerNftTokenAccount: ", diffBuyerNftTokenAccount);
    console.log("diffEscrowAccount: ", diffEscrowAccount);
    console.log("diffSellerDestinationAccount: ", diffSellerDestinationAccount);
    console.log("diffBuyerPayAccount: ", diffBuyerPayAccount);
    console.log("diffMarketDestinationAccount: ", diffMarketDestinationAccount);

    expect(diffCreatorsAtaListInfoAmount + diffSellerDestinationAccount + diffMarketDestinationAccount).to.equal(diffEscrowAccount);
    return nftPrice;
  }

  //close sell order func
  async function closeSellOrder(authority: Keypair, sellOrder: PublicKey, sellerNftToken: PublicKey){
    let sellOrderAccountInfo = await connection.getAccountInfo(sellOrder, 'confirmed');
    if (sellOrderAccountInfo) {
      console.log("before close sell order sellOrderAccountInfo exists");
    }else{
      console.log("before close sell order sellOrderAccountInfo does not exist");
    }

    let sellerNftTokenAccount = await getAccount(connection, sellerNftToken, 'confirmed');
    console.log("before close sell order sellerNftTokenAccountInfo: ", sellerNftTokenAccount.amount);
    let nftVault = await getAccount(connection, nftVault_sellorder, 'confirmed');
    console.log("before close sell order nftVaultInfo: ", nftVault.amount);
    const beforeCloseSellOrderNftVaultAmount = nftVault.amount;
    const beforeCloseSellOrderSellerNftTokenAccountAmount = sellerNftTokenAccount.amount;


    const tx = await program.methods.closeSellOrder().accounts({
      authority: authority.publicKey,
      sellOrder: sellOrder,
      nftMint: nftMint_sellorder,
      sellerNftTokenAccount: sellerNftToken,
      nftVault: nftVault_sellorder,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([authority]).rpc({
      commitment: 'confirmed',
    });

    sellOrderAccountInfo = await connection.getAccountInfo(sellOrder, 'confirmed');
    if (sellOrderAccountInfo) {
      console.log("after close sell order sellOrderAccountInfo exists");
    }else{
      console.log("after close sell order sellOrderAccountInfo does not exist");
    }

    sellerNftTokenAccount = await getAccount(connection, sellerNftToken, 'confirmed');
    console.log("after close sell order sellerNftTokenAccountInfo: ", sellerNftTokenAccount.amount);
    nftVault = await getAccount(connection, nftVault_sellorder, 'confirmed');
    console.log("after close sell order nftVaultInfo: ", nftVault.amount);
    const afterCloseSellOrderNftVaultAmount = nftVault.amount;
    const afterCloseSellOrderSellerNftTokenAccountAmount = sellerNftTokenAccount.amount;

    expect(beforeCloseSellOrderNftVaultAmount-afterCloseSellOrderNftVaultAmount).to.equal(afterCloseSellOrderSellerNftTokenAccountAmount - beforeCloseSellOrderSellerNftTokenAccountAmount);
  }

  //close buy order func
  async function closeBuyOrder(authority: Keypair, buyOrder: PublicKey, paidTokenAccount: PublicKey){
    let buyOrderAccountInfo = await connection.getAccountInfo(buyOrder, 'confirmed');
    if (buyOrderAccountInfo) {
      console.log("before close sell order buyOrderAccountInfo exists");
      console.log("before close sell order buyOrderAccountInfo lamports: ", buyOrderAccountInfo.lamports);
    }else{
      console.log("before close sell order buyOrderAccountInfo does not exist");
    }

    let escrowAccount = await getAccount(connection, escrow, 'confirmed');
    console.log("before close sell order escrowAccount: ", escrowAccount.amount);
    let paidTokenAccountInfo = await getAccount(connection, paidTokenAccount, 'confirmed');
    console.log("before close sell order paidTokenAccountInfo: ", paidTokenAccountInfo.amount);
    const beforeCloseBuyOrderEscrowAmount = escrowAccount.amount;
    const beforeCloseBuyOrderPaidTokenAmount = paidTokenAccountInfo.amount;

    const tx = await program.methods.closeBuyOrder().accounts({
      authority: authority.publicKey,
      market: market,
      buyOrder: buyOrder,
      settlementMint: settlementMint,
      escrow: escrow,
      receiveTokenAccount: paidTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([authority]).rpc({
      commitment: 'confirmed',
    });

    buyOrderAccountInfo = await connection.getAccountInfo(buyOrder, 'confirmed');
    if (buyOrderAccountInfo) {
      console.log("after close sell order buyOrderAccountInfo exists");
      console.log("after close sell order buyOrderAccountInfo lamports: ", buyOrderAccountInfo.lamports);
    }else{
      console.log("after close sell order buyOrderAccountInfo does not exist");
    }

    escrowAccount = await getAccount(connection, escrow, 'confirmed');
    console.log("after close sell order escrowAccount: ", escrowAccount.amount);
    paidTokenAccountInfo = await getAccount(connection, paidTokenAccount, 'confirmed');
    console.log("after close sell order paidTokenAccountInfo: ", paidTokenAccountInfo.amount);
    const afterCloseBuyOrderEscrowAmount = escrowAccount.amount;
    const afterCloseBuyOrderPaidTokenAmount = paidTokenAccountInfo.amount;

    expect(beforeCloseBuyOrderEscrowAmount-afterCloseBuyOrderEscrowAmount).to.equal(afterCloseBuyOrderPaidTokenAmount-beforeCloseBuyOrderPaidTokenAmount);
  }
  //init provider and program
  before(async () => {
    console.log("init provider and program starting...");
    const endpoint = "http://127.0.0.1:8899";
    const wsEndpoint = "ws://127.0.0.1:8900";
    connection = new Connection(endpoint, {wsEndpoint: wsEndpoint, commitment: 'confirmed'});

    wallet = anchor.Wallet.local();
    payer = wallet.payer
    provider = new anchor.AnchorProvider(connection, wallet, anchor.AnchorProvider.defaultOptions());
    anchor.setProvider(anchor.AnchorProvider.env());
    program = anchor.workspace.nftMarketplace as Program<NftMarketplace>;

    const keypairPath = `${process.env.HOME}/${KEYPAIR_FILE_FILE}`;
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    seller = Keypair.fromSecretKey(new Uint8Array(keypairData));

    const devUserKeypairPath = `${process.env.HOME}/.config/solana/devnet-keypair.json`;
    const devUserKeypair = JSON.parse(fs.readFileSync(devUserKeypairPath, 'utf-8'));
    devUser = Keypair.fromSecretKey(new Uint8Array(devUserKeypair));

    umi = createUmi(connection).use(mplTokenMetadata());
    const payerUmi = fromWeb3JsKeypair(payer);
    const payerSigner = createSignerFromKeypair(umi, payerUmi);

    // 设置签名者
    umi.use(signerIdentity(payerSigner));

    console.log("\n----------MAIN KEYPAIR----PING----------\n");
    console.log("seller: ", seller.publicKey.toBase58());
    console.log("payer: ", payer.publicKey.toBase58());
    console.log("marketDestination: ", devUser.publicKey.toBase58());
    console.log("settlementOldMint: ", settlementOldMint.toBase58());
    console.log("settlementOldAta: ", settlementOldAta.toBase58());
    console.log("buyersettlementAta: ", buyersettlementAta.toBase58());
    console.log("settlementMint: ", settlementMint.toBase58());
    console.log("sellerDestination: ", sellerDestination.toBase58());
    console.log("settlementOwner: ", settlementOwner.toBase58());
    console.log("requiredVerifier: ", requiredVerifier.toBase58());
    console.log("metadata_sellorder: ", metadata_sellorder.toBase58());
    console.log("nftMint_sellorder: ", nftMint_sellorder.toBase58());
    console.log("sellerNftTokenAccount_sellorder: ", sellerNftTokenAccount_sellorder.toBase58());
    console.log("buyerAta_sellorder: ", buyerNftTokenAccount_sellorder.toBase58());
    console.log("\n----------MAIN KEYPAIR----PONG------\n");

    await initializeKeypair(connection, {keypairPath: keypairPath});
    await initializeKeypair(connection, {keypairPath: devUserKeypairPath});
    await airdropIfRequired(connection, devUser.publicKey, 10, 10);
    await airdropIfRequired(connection, seller.publicKey, 10, 10);

    // define the market
    market = PublicKey.findProgramAddressSync(
      [
        Buffer.from(MARKET_SEED),
        payer.publicKey.toBuffer()
      ],
      program.programId,
    )[0];

    console.log("market: ", market.toBase58());

    //define the escrow

    oldescrow = PublicKey.findProgramAddressSync(
      [
        Buffer.from(ESCROW_SEED), 
        settlementOldMint.toBuffer(), 
        market.toBuffer()
      ],
      program.programId,
    )[0];

    escrow = PublicKey.findProgramAddressSync(
      [
        Buffer.from(ESCROW_SEED), 
        settlementMint.toBuffer(), 
        market.toBuffer()
      ],
      program.programId,
    )[0];

    collection = PublicKey.findProgramAddressSync(
      [
        Buffer.from(COLLECTION_SEED),
        market.toBuffer(),
        Buffer.from(collectionName),
      ],
      program.programId,
    )[0];

    nftVault_sellorder = PublicKey.findProgramAddressSync(
      [
        Buffer.from(NFT_VAULT_SEED),
        nftMint_sellorder.toBuffer(),
      ],
      program.programId,
    )[0];

    nftVault_buyorder_sellorder = PublicKey.findProgramAddressSync(
      [
        Buffer.from(NFT_VAULT_SEED),
        nftMint_buyorder_sellorder.toBuffer(),
      ],
      program.programId,
    )[0];
    sellOrder = PublicKey.findProgramAddressSync(
      [
        Buffer.from(SELL_ORDER_SEED),
        sellerNftTokenAccount_sellorder.toBuffer(),
        new BN(100).toBuffer('le', 8),
      ],
      program.programId,
    )[0];

    sellOrderToMatchBuyOrder = PublicKey.findProgramAddressSync(
      [
        Buffer.from(SELL_ORDER_SEED),
        sellerNftTokenAccount_buyorder_sellorder.toBuffer(),
        new BN(300).toBuffer('le', 8),
      ],
      program.programId,
    )[0];

    sellOrderToClose = PublicKey.findProgramAddressSync(
      [
        Buffer.from(SELL_ORDER_SEED),
        buyerNftTokenAccount_sellorder.toBuffer(),
        new BN(100).toBuffer('le', 8),
      ],
      program.programId,
    )[0];

    buyOrder = PublicKey.findProgramAddressSync(  
      [
        Buffer.from(BUY_ORDER_SEED),
        market.toBuffer(),
        nftMint_buyorder.toBuffer(),
        payer.publicKey.toBuffer(),
        new BN(200).toBuffer('le', 8),
      ],
      program.programId,
    )[0];

    buyOrderToMatchSellOrder = PublicKey.findProgramAddressSync(
      [
        Buffer.from(BUY_ORDER_SEED),
        market.toBuffer(),
        nftMint_buyorder_sellorder.toBuffer(),
        payer.publicKey.toBuffer(),
        new BN(400).toBuffer('le', 8),
      ],
      program.programId,
    )[0];

    buyOrderToClose = PublicKey.findProgramAddressSync(
      [
        Buffer.from(BUY_ORDER_SEED),
        market.toBuffer(),
        nftMint_buyorder.toBuffer(),
        seller.publicKey.toBuffer(),
        new BN(100).toBuffer('le', 8),
      ],
      program.programId,
    )[0];

    console.log("-------------pda----------------");
    console.log("escrow: ", escrow.toBase58());
    console.log("oldescrow: ", oldescrow.toBase58());
    console.log("nftVault_sellorder: ", nftVault_sellorder.toBase58());
    console.log("nftVault_buyorder_sellorder: ", nftVault_buyorder_sellorder.toBase58());
    console.log("sellOrder: ", sellOrder.toBase58());
    console.log("buyOrder: ", buyOrder.toBase58());
    console.log("sellOrderToMatchBuyOrder: ", sellOrderToMatchBuyOrder.toBase58());
    console.log("buyOrderToMatchSellOrder: ", buyOrderToMatchSellOrder.toBase58());
    console.log("sellOrderToClose: ", sellOrderToClose.toBase58());
    console.log("buyOrderToClose: ", buyOrderToClose.toBase58());
    console.log("-------------pda----------------");
  });


  it("init market!", async () => {
    // Add your test here.
    const tx = await program.methods.initMarket(100).accounts({
      authority: payer.publicKey,
      settlementMint: settlementOldMint,
      feesDestination: settlementOldAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc({
      commitment: 'confirmed',
    });
    const oldescrowAccount = await connection.getAccountInfo(oldescrow, 'confirmed');
    if (oldescrowAccount) {
      console.log("oldescrowAccount exists : ", oldescrowAccount.owner.toBase58());
    }else{
      console.log("oldescrowAccount does not exist");
    }
    const marketAccount = await program.account.market.fetch(market, 'confirmed');
    console.log("marketAccount: ", JSON.stringify(marketAccount));
    expect(marketAccount.authority.toBase58()).to.equal(payer.publicKey.toBase58());
    expect(marketAccount.feesDestination.toBase58()).to.equal(settlementOldAta.toBase58());
    expect(marketAccount.settlementMint.toBase58()).to.equal(settlementOldMint.toBase58());
  });

  it("update market!", async () => {
    const tx = await program.methods.updateMarket(200, null, null).accounts({
      authority: payer.publicKey,
      market: market,
    }).rpc({
      commitment: 'confirmed',
    });
    const marketAccount = await program.account.market.fetch(market, 'confirmed');
    console.log("marketAccount: ", JSON.stringify(marketAccount));
    expect(marketAccount.feeBasisPoints).to.equal(200);
  });

  it("update market mint!", async () => {
    const tx = await program.methods.updateMarketMint(marketDestination).accounts({
      authority: payer.publicKey,
      market: market,
      settlementMint: settlementMint,
      feesDestination: marketDestination,
      oldEscrow: oldescrow,
      oldEscrowAuthority: payer.publicKey,
      escrow: escrow,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc({
      commitment: 'confirmed',
    });

    const oldescrowAccount = await connection.getAccountInfo(oldescrow, 'confirmed');
    if (oldescrowAccount) {
      console.log("oldescrowAccount exists : ", oldescrowAccount.owner.toBase58());
    }else{
      console.log("oldescrowAccount does not exist");
    }

    const escrowAccount = await connection.getAccountInfo(escrow, 'confirmed');
    if (escrowAccount) {
      console.log("escrowAccount exists : ", escrowAccount.owner.toBase58());
    }else{
      console.log("escrowAccount does not exist");
    }

    const marketAccount = await program.account.market.fetch(market, 'confirmed');
    console.log("marketAccount: ", JSON.stringify(marketAccount));
    expect(marketAccount.feesDestination.toBase58()).to.equal(marketDestination.toBase58());
    expect(marketAccount.settlementMint.toBase58()).to.equal(settlementMint.toBase58());
    
  });

  it("init collection!", async () => {
    const tx = await program.methods.initCollection(collectionName, collectionSymbol, 150, requiredVerifier, false).accounts({
      authority: payer.publicKey,
      market: market,
      systemProgram: SystemProgram.programId,
    }).rpc({
      commitment: 'confirmed',
    });
    const collectionAccount = await program.account.collection.fetch(collection, 'confirmed');
    console.log("collectionAccount: ", JSON.stringify(collectionAccount));
    expect(collectionAccount.name).to.equal("bernese");
    expect(collectionAccount.symbol).to.equal("bernese");
    expect(collectionAccount.feeBasisPoints).to.equal(150);
    expect(collectionAccount.requiredVerifier.toBase58()).to.equal(requiredVerifier.toBase58());
  });

  it("update collection!", async () => {
    const tx = await program.methods.updateCollection(250, "berne", null, null).accounts({
      authority: payer.publicKey,
      market: market,
      collection: collection,
      systemProgram: SystemProgram.programId,
    }).rpc({
      commitment: 'confirmed',
    });
    const collectionAccount = await program.account.collection.fetch(collection, 'confirmed');
    console.log("collectionAccount: ", JSON.stringify(collectionAccount));
    expect(collectionAccount.name).to.equal("bernese");
    expect(collectionAccount.symbol).to.equal("berne");
    expect(collectionAccount.feeBasisPoints).to.equal(250);
  });

  it("init sell order!", async () => {
    const currentTime = new Date().getTime();
    const expiresAt = currentTime + 1000 * 60 * 60 * 24 * 7;
    const tx = await program.methods.initSellOrder(new BN(100), new BN(expiresAt)).accounts({
      payer: seller.publicKey,
      market: market,
      collection: collection,
      sellerNftTokenAccount: sellerNftTokenAccount_sellorder,
      nftMint: nftMint_sellorder,
      nftVault: nftVault_sellorder,
      metadata: metadata_sellorder,
      destination: sellerDestination,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([seller]).rpc({
      commitment: 'confirmed',
    });
    const sellOrderAccount = await program.account.sellOrder.fetch(sellOrder, 'confirmed');
    console.log("sellOrderAccount: ", JSON.stringify(sellOrderAccount));
    expect(sellOrderAccount.sellerNftTokenAccount.toBase58()).to.equal(sellerNftTokenAccount_sellorder.toBase58());
    expect(sellOrderAccount.nftMint.toBase58()).to.equal(nftMint_sellorder.toBase58());
    expect(sellOrderAccount.destination.toBase58()).to.equal(sellerDestination.toBase58());
    expect(sellOrderAccount.price.toNumber()).to.equal(100);
    expect(sellOrderAccount.expiresAt.toNumber()).to.equal(expiresAt);
  });

  it("buy nft!", async () => {

    const trackSaleInfoBefore = await trackSaleInfo("before buy nft ");

    const settlementMintInfo = await getMint(connection, settlementMint);
    const settlementDecimals = settlementMintInfo.decimals;

    const sellOrderAccount = await program.account.sellOrder.fetch(sellOrder, 'confirmed');
    const nftPrice = sellOrderAccount.price;
    const collectionAccount = await program.account.collection.fetch(collection, 'confirmed');
    const feeBasisPoints = new BN(collectionAccount.feeBasisPoints);
    const marketFee = nftPrice.mul(feeBasisPoints).mul(new BN(Math.pow(10, settlementDecimals))).div(new BN(10000));

    const metadataInfo = await fetchMetadata(umi, fromWeb3JsPublicKey(metadata_sellorder));
    const creatorsFee = nftPrice.mul(new BN(metadataInfo.sellerFeeBasisPoints)).mul(new BN(Math.pow(10, settlementDecimals))).div(new BN(10000));
   
    const sellerFee = nftPrice.mul(new BN(Math.pow(10, settlementDecimals))).sub(creatorsFee).sub(marketFee);

    console.log("marketFeeBasisPoints: ", feeBasisPoints.toNumber());
    console.log("sellerFeeBasisPoints: ", metadataInfo.sellerFeeBasisPoints);
    console.log("--calculate--marketFee: ", marketFee.toNumber());
    console.log("--calculate--creatorsFee: ", creatorsFee.toNumber());
    console.log("--calculate--sellerFee: ", sellerFee.toNumber());

    const remainingAccounts = creatorsAtaList_sellorder.map((creatorAta) => {
      return {
        pubkey: new PublicKey(creatorAta),
        isWritable: true,
        isSigner: false,
      }
    })

    const tx = await program.methods.buyNft().accounts({
      buyer: payer.publicKey,
      market: market,
      marketDestination: marketDestination,
      collection: collection,
      sellOrder: sellOrder,
      sellerDestination: sellerDestination,
      paidTokenAccount: buyersettlementAta,
      settlementMint: settlementMint,
      buyerNftTokenAccount: buyerNftTokenAccount_sellorder,
      nftMint: nftMint_sellorder,
      nftVault: nftVault_sellorder,
      metadata: metadata_sellorder,
      paidTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).remainingAccounts(remainingAccounts).signers([payer]).rpc({
      commitment: 'confirmed',  
    });

    const trackSaleInfoAfter = await trackSaleInfo("after buy nft ");

    
    const diffSellerNftTokenAccount = trackSaleInfoAfter.sellerNftTokenAccount.amount - (trackSaleInfoBefore.sellerNftTokenAccount.amount);
    const diffBuyerNftTokenAccount = trackSaleInfoAfter.buyerNftTokenAccount.amount - (trackSaleInfoBefore.buyerNftTokenAccount.amount);
    const diffNftVault = trackSaleInfoBefore.nftVault.amount - (trackSaleInfoAfter.nftVault.amount);
    const diffSellerDestinationAccount = trackSaleInfoAfter.sellerDestinationAccount.amount - (trackSaleInfoBefore.sellerDestinationAccount.amount);
    const diffBuyerPayAccount = trackSaleInfoBefore.buyerPayAccount.amount - (trackSaleInfoAfter.buyerPayAccount.amount);
    const diffMarketDestinationAccount = trackSaleInfoAfter.marketDestinationAccount.amount - (trackSaleInfoBefore.marketDestinationAccount.amount);
    const diffCreatorsAtaListInfoAmount = trackSaleInfoAfter.creatorsAtaListInfoAmount - (trackSaleInfoBefore.creatorsAtaListInfoAmount);
    
    console.log("diffSellerNftTokenAccount: ", diffSellerNftTokenAccount);
    console.log("diffBuyerNftTokenAccount: ", diffBuyerNftTokenAccount);
    console.log("diffNftVault: ", diffNftVault);
    console.log("diffSellerDestinationAccount: ", diffSellerDestinationAccount);
    console.log("diffBuyerPayAccount: ", diffBuyerPayAccount);
    console.log("diffMarketDestinationAccount: ", diffMarketDestinationAccount);

    expect(diffCreatorsAtaListInfoAmount + diffSellerDestinationAccount + diffMarketDestinationAccount).to.equal(diffBuyerPayAccount);
  });

  it("init buy order!", async () => {

    let escrowAccount = await getAccount(connection, escrow, 'confirmed');
    let paidTokenAccount = await getAccount(connection, buyersettlementAta, 'confirmed');
    console.log("before init buy order escrowAccount: ", escrowAccount.amount);
    console.log("before init buy order paidTokenAccount: ", paidTokenAccount.amount);

    const currentTime = new Date().getTime();
    const expiresAt = currentTime + 1000 * 60 * 60 * 24 * 7;
    const tx = await program.methods.initBuyOrder(new BN(200), new BN(expiresAt)).accounts({
      payer: payer.publicKey,
      market: market,
      collection: collection,
      settlementMint: settlementMint,
      nftMint: nftMint_buyorder,
      escrow: escrow,
      paidTokenAccount: buyersettlementAta,
      buyerNftTokenAccount: buyerNftTokenAccount_buyorder,
      metadata: metadata_buyorder,
      paidTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc({
      commitment: 'confirmed',
    }); 

    escrowAccount = await getAccount(connection, escrow, 'confirmed');
    paidTokenAccount = await getAccount(connection, buyersettlementAta, 'confirmed');
    console.log("after init buy order escrowAccount: ", escrowAccount.amount);
    console.log("after init buy order paidTokenAccount: ", paidTokenAccount.amount);

    const buyOrderAccount = await program.account.buyOrder.fetch(buyOrder, 'confirmed');
    console.log("buyOrderAccount: ", JSON.stringify(buyOrderAccount));
    expect(buyOrderAccount.nftMint.toBase58()).to.equal(nftMint_buyorder.toBase58());
    expect(buyOrderAccount.destination.toBase58()).to.equal(buyerNftTokenAccount_buyorder.toBase58());
    expect(buyOrderAccount.pricePosition.toNumber()).to.equal(200);
    expect(buyOrderAccount.expiresAt.toNumber()).to.equal(expiresAt);
  });

  it("match buy order without sell order!", async () => {
    await matchBuyOrder(
      buyOrder,
      sellerNftTokenAccount_buyorder, 
      nftMint_buyorder, 
      buyerNftTokenAccount_buyorder, 
      metadata_buyorder, 
      null,
      creatorsAtaList_buyorder
    );
   
  
  });

  it("init sell order to match buy order!", async () => {
    const currentTime = new Date().getTime();
    const expiresAt = currentTime + 1000 * 60 * 60 * 24 * 7;
    const tx = await program.methods.initSellOrder(new BN(300), new BN(expiresAt)).accounts({
      payer: seller.publicKey,
      market: market,
      collection: collection,
      sellerNftTokenAccount: sellerNftTokenAccount_buyorder_sellorder,
      nftMint: nftMint_buyorder_sellorder,
      nftVault: nftVault_buyorder_sellorder,
      metadata: metadata_buyorder_sellorder,
      destination: sellerDestination,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([seller]).rpc({
      commitment: 'confirmed',
    });
    const sellOrderAccount = await program.account.sellOrder.fetch(sellOrderToMatchBuyOrder, 'confirmed');
    console.log("sellOrderAccount: ", JSON.stringify(sellOrderAccount));
    expect(sellOrderAccount.sellerNftTokenAccount.toBase58()).to.equal(sellerNftTokenAccount_buyorder_sellorder.toBase58());
    expect(sellOrderAccount.nftMint.toBase58()).to.equal(nftMint_buyorder_sellorder.toBase58());
    expect(sellOrderAccount.destination.toBase58()).to.equal(sellerDestination.toBase58());
    expect(sellOrderAccount.price.toNumber()).to.equal(300);
    expect(sellOrderAccount.expiresAt.toNumber()).to.equal(expiresAt);
  });


  it("init buy order to match sell order!", async () => {

    let escrowAccount = await getAccount(connection, escrow, 'confirmed');
    let paidTokenAccount = await getAccount(connection, buyersettlementAta, 'confirmed');
    console.log("before init buy order escrowAccount: ", escrowAccount.amount);
    console.log("before init buy order paidTokenAccount: ", paidTokenAccount.amount);

    const currentTime = new Date().getTime();
    const expiresAt = currentTime + 1000 * 60 * 60 * 24 * 7;
    const tx = await program.methods.initBuyOrder(new BN(400), new BN(expiresAt)).accounts({
      payer: payer.publicKey,
      market: market,
      collection: collection,
      settlementMint: settlementMint,
      nftMint: nftMint_buyorder_sellorder,
      escrow: escrow,
      paidTokenAccount: buyersettlementAta,
      buyerNftTokenAccount: buyerNftTokenAccount_buyorder_sellorder,
      metadata: metadata_buyorder_sellorder,
      paidTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc({
      commitment: 'confirmed',
    }); 

    escrowAccount = await getAccount(connection, escrow, 'confirmed');
    paidTokenAccount = await getAccount(connection, buyersettlementAta, 'confirmed');
    console.log("after init buy order escrowAccount: ", escrowAccount.amount);
    console.log("after init buy order paidTokenAccount: ", paidTokenAccount.amount);

    const buyOrderAccount = await program.account.buyOrder.fetch(buyOrderToMatchSellOrder, 'confirmed');
    console.log("buyOrderAccount: ", JSON.stringify(buyOrderAccount));
    expect(buyOrderAccount.nftMint.toBase58()).to.equal(nftMint_buyorder_sellorder.toBase58());
    expect(buyOrderAccount.destination.toBase58()).to.equal(buyerNftTokenAccount_buyorder_sellorder.toBase58());
    expect(buyOrderAccount.pricePosition.toNumber()).to.equal(400);
    expect(buyOrderAccount.expiresAt.toNumber()).to.equal(expiresAt);
  });

  it("match buy order with sell order!", async () => {

    const currentTime = new Date().getTime();
    console.log("currentTime: ", currentTime);
    let  sellOrderAccount = await program.account.sellOrder.fetch(sellOrderToMatchBuyOrder, 'confirmed');
    console.log("before match buy order sellOrderAccount: ", JSON.stringify(sellOrderAccount));
    console.log("before match buy order sellOrderAccount isSold: ", sellOrderAccount.isSold);
    console.log("before match buy order sellOrderAccount price: ", sellOrderAccount.price.toNumber());
    console.log("before match buy order sellOrderAccount expiresAt: ", sellOrderAccount.expiresAt.toNumber());

    let buyOrderAccount = await program.account.buyOrder.fetch(buyOrderToMatchSellOrder, 'confirmed');
    console.log("before match buy order buyOrderAccount: ", JSON.stringify(buyOrderAccount));
    console.log("before match buy order buyOrderAccount isSold: ", buyOrderAccount.isBought);
    console.log("before match buy order buyOrderAccount price: ", buyOrderAccount.pricePosition.toNumber());

    const price = await matchBuyOrder(
      buyOrderToMatchSellOrder,
      nftVault_buyorder_sellorder, 
      nftMint_buyorder_sellorder, 
      buyerNftTokenAccount_buyorder_sellorder, 
      metadata_buyorder_sellorder, 
      sellOrderToMatchBuyOrder,
      creatorsAtaList_buyorder_sellorder
    );

    sellOrderAccount = await program.account.sellOrder.fetch(sellOrderToMatchBuyOrder, 'confirmed');
    console.log("after match buy order sellOrderAccount: ", JSON.stringify(sellOrderAccount));
    console.log("after match buy order sellOrderAccount isSold: ", sellOrderAccount.isSold);
    console.log("after match buy order sellOrderAccount price: ", sellOrderAccount.price.toNumber());

    buyOrderAccount = await program.account.buyOrder.fetch(buyOrderToMatchSellOrder, 'confirmed');
    console.log("after match buy order buyOrderAccount: ", JSON.stringify(buyOrderAccount));
    console.log("after match buy order buyOrderAccount isSold: ", buyOrderAccount.isBought);
    console.log("after match buy order buyOrderAccount price: ", buyOrderAccount.pricePosition.toNumber());

    expect(price.toNumber()).to.equal(sellOrderAccount.price.toNumber());
    expect(sellOrderAccount.isSold).to.equal(true);
  });

  it("close sell order which is sold! ", async () => {
    await closeSellOrder(seller, sellOrder, sellerNftTokenAccount_sellorder);
  });

  it("init sell order to close!", async () => {
    const currentTime = new Date().getTime();
    const expiresAt = currentTime + 1000 * 60 * 60 * 24 * 7;
    const tx = await program.methods.initSellOrder(new BN(100), new BN(expiresAt)).accounts({
      payer: payer.publicKey,
      market: market,
      collection: collection,
      sellerNftTokenAccount: buyerNftTokenAccount_sellorder,
      nftMint: nftMint_sellorder,
      nftVault: nftVault_sellorder,
      metadata: metadata_sellorder,
      destination: buyersettlementAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).rpc({
      commitment: 'confirmed',
    });
    const sellOrderAccount = await program.account.sellOrder.fetch(sellOrderToClose, 'confirmed');
    console.log("sellOrderAccount: ", JSON.stringify(sellOrderAccount));
    expect(sellOrderAccount.sellerNftTokenAccount.toBase58()).to.equal(buyerNftTokenAccount_sellorder.toBase58());
    expect(sellOrderAccount.nftMint.toBase58()).to.equal(nftMint_sellorder.toBase58());
    expect(sellOrderAccount.destination.toBase58()).to.equal(buyersettlementAta.toBase58());
    expect(sellOrderAccount.price.toNumber()).to.equal(100);
    expect(sellOrderAccount.expiresAt.toNumber()).to.equal(expiresAt);
  });

  it("close sell order which is not sold! ", async () => {
    await closeSellOrder(payer, sellOrderToClose, buyerNftTokenAccount_sellorder);
  });

  it("colse buy order which is bought! ", async () => {
    await closeBuyOrder(payer, buyOrder, buyersettlementAta);
  });

  it("init buy order to close!", async () => {

    let escrowAccount = await getAccount(connection, escrow, 'confirmed');
    let paidTokenAccount = await getAccount(connection, sellerDestination, 'confirmed');
    console.log("before init buy order escrowAccount: ", escrowAccount.amount);
    console.log("before init buy order paidTokenAccount: ", paidTokenAccount.amount);

    const currentTime = new Date().getTime();
    const expiresAt = currentTime + 1000 * 60 * 60 * 24 * 7;
    const tx = await program.methods.initBuyOrder(new BN(100), new BN(expiresAt)).accounts({
      payer: seller.publicKey,
      market: market,
      collection: collection,
      settlementMint: settlementMint,
      nftMint: nftMint_buyorder,
      escrow: escrow,
      paidTokenAccount: sellerDestination,
      buyerNftTokenAccount: sellerNftTokenAccount_buyorder,
      metadata: metadata_buyorder,
      paidTokenProgram: TOKEN_PROGRAM_ID,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    }).signers([seller]).rpc({
      commitment: 'confirmed',
    }); 

    escrowAccount = await getAccount(connection, escrow, 'confirmed');
    paidTokenAccount = await getAccount(connection, sellerDestination, 'confirmed');
    console.log("after init buy order escrowAccount: ", escrowAccount.amount);
    console.log("after init buy order paidTokenAccount: ", paidTokenAccount.amount);

    const buyOrderAccount = await program.account.buyOrder.fetch(buyOrderToClose, 'confirmed');
    console.log("buyOrderAccount: ", JSON.stringify(buyOrderAccount));
    expect(buyOrderAccount.nftMint.toBase58()).to.equal(nftMint_buyorder.toBase58());
    expect(buyOrderAccount.destination.toBase58()).to.equal(sellerNftTokenAccount_buyorder.toBase58());
    expect(buyOrderAccount.pricePosition.toNumber()).to.equal(100);
    expect(buyOrderAccount.expiresAt.toNumber()).to.equal(expiresAt);
  });

  it("colse buy order which is not bought! ", async () => {
    await closeBuyOrder(seller, buyOrderToClose, sellerDestination);
  });

});