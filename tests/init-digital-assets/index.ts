
import { uploadOffChainMetadata, LabNFTMetadata } from "./upload-helper";
import { percentAmount, generateSigner, createSignerFromKeypair, unwrapOption, signerIdentity  } from '@metaplex-foundation/umi'
import { createNft,createV1,Creator,CreatorArgs,fetchDigitalAsset,fetchDigitalAssetWithAssociatedToken,fetchDigitalAssetWithTokenByMint,mintV1,mplTokenMetadata, TokenStandard, verifyCreatorV1  } from '@metaplex-foundation/mpl-token-metadata'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction, Transaction } from "@solana/web3.js";
import {makeKeypairs} from '@solana-developers/helpers'
import { fromWeb3JsKeypair, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters';
import { DigitalAssetInfo, TestDigitalAsset } from "./test-interface";
import { 
    createAssociatedTokenAccountInstruction, 
    getAssociatedTokenAddressSync,
    TOKEN_PROGRAM_ID, 
} from "@solana/spl-token";
import dotenv from "dotenv";
import * as yaml from 'js-yaml';
import fs from "fs";

dotenv.config();


function getKeypair(path: string): Keypair {
    const keypairData = JSON.parse(fs.readFileSync(path, 'utf-8'));
    return Keypair.fromSecretKey(new Uint8Array(keypairData));
}

async function createAssociatedToken(connection: Connection, payer: Keypair, mint: Keypair, owner: Keypair): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
        mint.publicKey,
        owner.publicKey,
        false,
        TOKEN_PROGRAM_ID,
    );

    const createAtaInstruction = createAssociatedTokenAccountInstruction(
        payer.publicKey,
        ata,
        owner.publicKey,
        mint.publicKey,
        TOKEN_PROGRAM_ID,
    )

    const transaction = new Transaction().add(createAtaInstruction);
    const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [payer]
    );

    return ata;

}

(async () => {
    const endpoint = "http://127.0.0.1:8899";
    const wsEndpoint = "ws://127.0.0.1:8900";
    const connection = new Connection(endpoint, {wsEndpoint: wsEndpoint, commitment: 'confirmed'});
    const umi = createUmi(connection).use(mplTokenMetadata());


    const destinationKeypairPath = `${process.env.HOME}/.config/solana/devnet-keypair.json`;
    const destinationKeypair = getKeypair(destinationKeypairPath);
    const destinationUmi = fromWeb3JsKeypair(destinationKeypair);
    const destinationSigner = createSignerFromKeypair(umi, destinationUmi);

    const DefaultKeypairPath = `${process.env.HOME}/.config/solana/id.json`;
    const payer = getKeypair(DefaultKeypairPath);
    console.log("Payer: ", payer.publicKey.toBase58());

    const payerUmi = fromWeb3JsKeypair(payer);
    const payerSigner = createSignerFromKeypair(umi, payerUmi);

    // 设置签名者
    umi.use(signerIdentity(payerSigner));

    //init seller
    const KEYPAIR_FILE_FILE = 'my-keypair.json';
    const seller = getKeypair(`${process.env.HOME}/${KEYPAIR_FILE_FILE}`);
    console.log("Seller: ", seller.publicKey.toBase58());
    const sellerUmi = fromWeb3JsKeypair(seller);
    const sellerSigner = createSignerFromKeypair(umi, sellerUmi);


    const [dog0Mint, dog1Mint, dog2Mint, dog3Mint, dog4Mint, settlementMint, settlementOldMint] = makeKeypairs(7);
    const [creatorBobKeypair, creatorAliceKeypair, creatorCharlieKeypair] = makeKeypairs(3);

    const creatorInfoList= [{keypair: creatorBobKeypair, share: 10}, {keypair: creatorAliceKeypair, share: 40}, {keypair: creatorCharlieKeypair, share: 50}];
    const creatorListArgs: CreatorArgs[] = creatorInfoList.map((creator) => {
        const umiKeypair = fromWeb3JsKeypair(creator.keypair);
        return {
            address: umiKeypair.publicKey,
            share: creator.share,
            verified: false
        }
    });

    const metadataInfoList: LabNFTMetadata[] = [
        {
            mint: dog0Mint,
            imagePath: "tests/init-digital-assets/assets/bernese.jpeg",
            tokenName: "bernese",
            tokenDescription: "bernese dog",
            tokenSymbol: "bernese",
            tokenExternalUrl: "https://solana.com/",
            tokenAdditionalMetadata: {},
            tokenUri: "",
        },
        {
            mint: dog1Mint,
            imagePath: "tests/init-digital-assets/assets/bernese.jpg",
            tokenName: "bernesetiny",
            tokenDescription: "bernesetiny",
            tokenSymbol: "berneset",
            tokenExternalUrl: "https://solana.com/",
            tokenAdditionalMetadata: {},
            tokenUri: "",
        },
        {
            mint: dog2Mint,
            imagePath: "tests/init-digital-assets/assets/bernese.jpeg",
            tokenName: "bernesebig",
            tokenDescription: "bernesebig",
            tokenSymbol: "berneseb",
            tokenExternalUrl: "https://solana.com/",
            tokenAdditionalMetadata: {},
            tokenUri: "",
        },
        {
            mint: dog3Mint,
            imagePath: "tests/init-digital-assets/assets/bichon.jpg",
            tokenName: "bichon",
            tokenDescription: "bichon dog",
            tokenSymbol: "bichon",
            tokenExternalUrl: "https://solana.com/",
            tokenAdditionalMetadata: {},
            tokenUri: "",
        },
        {
            mint: dog4Mint,
            imagePath: "tests/init-digital-assets/assets/labrador.jpeg",
            tokenName: "labrador",
            tokenDescription: "labrador dog",
            tokenSymbol: "labrador",
            tokenExternalUrl: "https://solana.com/",
            tokenAdditionalMetadata: {},
            tokenUri: "",
        },
        
    ]

    // init settlement mint
    const settlementOldKeypair = fromWeb3JsKeypair(settlementOldMint);
    const settlementOldSigner = createSignerFromKeypair(umi, settlementOldKeypair);
    await createV1(umi, {
        mint: settlementOldSigner,
        authority: umi.identity,
        name: "OldMint",
        symbol: "OldMint",
        uri: "",
        tokenStandard: TokenStandard.Fungible,
        decimals: 6,
        sellerFeeBasisPoints: percentAmount(0),
    }).sendAndConfirm(umi);


    const settlementKeypair = fromWeb3JsKeypair(settlementMint);
    const settlementSigner = createSignerFromKeypair(umi, settlementKeypair);
    await createV1(umi, {
        mint: settlementSigner,
        authority: umi.identity,
        name: "settlement",
        symbol: "settlement",
        uri: "",
        tokenStandard: TokenStandard.Fungible,
        decimals: 6,
        sellerFeeBasisPoints: percentAmount(0),
    }).sendAndConfirm(umi);

    await mintV1(umi, {
        mint: settlementSigner.publicKey,
        authority: umi.identity,
        amount: 1000000000000,
        tokenOwner: umi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
      }).sendAndConfirm(umi)


    //create destination
    console.log("create destination starting.....");
    const destinationOldAta = await createAssociatedToken(connection, payer, settlementOldMint, destinationKeypair);
    const destinationAta = await createAssociatedToken(connection, payer, settlementMint, destinationKeypair);
    const sellerDestinationAta = await createAssociatedToken(connection, payer, settlementMint, seller);
    const creatorsAtaList: string[] = [];
    for (const creatorInfo of creatorInfoList) {
        const creatorAta = await createAssociatedToken(connection, payer, settlementMint, creatorInfo.keypair);
        creatorsAtaList.push(creatorAta.toBase58());
    }

    let settlementAsset = await fetchDigitalAssetWithAssociatedToken(umi, settlementSigner.publicKey, umi.identity.publicKey);
    const settlementAta = toWeb3JsPublicKey(settlementAsset.token.publicKey).toBase58()
    const settlementMintKey = toWeb3JsPublicKey(settlementSigner.publicKey).toBase58()
    const settlementOwner = toWeb3JsPublicKey(umi.identity.publicKey).toBase58()
    console.log("settlementAta: ", settlementAta);
    console.log("settlementAta amount: ", settlementAsset.token.amount);

      // UPLOAD MEMBER METADATA
    for (const metadataInfo of metadataInfoList) {
        if(metadataInfo.tokenName.startsWith("bernese") && metadataInfo.tokenName != "bernese") {
            continue;
        }
        metadataInfo.tokenUri = await uploadOffChainMetadata(payer, metadataInfo);
        console.log("Metadata URI: ", metadataInfo.tokenUri);
    }
    metadataInfoList[1].tokenUri = metadataInfoList[0].tokenUri;
    metadataInfoList[2].tokenUri = metadataInfoList[0].tokenUri;

    let DigitalAssetInfoList: DigitalAssetInfo[] = [];
    let idx = 0;
    for (const metadataInfo of metadataInfoList) {
        const umiKeypair = fromWeb3JsKeypair(metadataInfo.mint);
        const mintSigner = createSignerFromKeypair(umi, umiKeypair);
        console.log("createNft starting.....");

        await createV1(umi, {
            mint: mintSigner,
            authority: umi.identity,
            name: metadataInfo.tokenName,
            symbol: metadataInfo.tokenSymbol,
            uri: metadataInfo.tokenUri,
            sellerFeeBasisPoints: percentAmount(5.5),
            creators: creatorListArgs,
            tokenStandard: TokenStandard.NonFungible,
            decimals: 0,

        }).sendAndConfirm(umi);

        console.log("fetchDigitalAsset starting.....");
        let asset = await fetchDigitalAsset(umi, mintSigner.publicKey);
        let creatorList : Creator[] = unwrapOption(asset.metadata.creators, () => []);
        const creatorsPkList = creatorList.map((creator) => toWeb3JsPublicKey(creator.address).toBase58());
        console.log("asset.edition.isOriginal: ", asset.edition.isOriginal);
        console.log("asset.edition.key: ", toWeb3JsPublicKey(asset.edition.publicKey).toBase58());

        console.log("verifyCreatorV1 starting.....");
        for (const creatorInfo of creatorInfoList) {
            const creatorSigner = createSignerFromKeypair(umi, fromWeb3JsKeypair(creatorInfo.keypair));
            await verifyCreatorV1(umi, {
                metadata: asset.metadata.publicKey,
                authority: creatorSigner,
            }).sendAndConfirm(umi)
        }

        console.log("mintV1 starting.....");
        // const tokenOwner = (idx == metadataInfoList.length - 1 ? payerUmi : sellerUmi);
        // const tokenOwnerKeyPair = (idx == metadataInfoList.length - 1 ? payer : seller);
        const tokenOwner = sellerUmi;
        const tokenOwnerKeyPair = payer;
        await mintV1(umi, {
            mint: mintSigner.publicKey,
            authority: umi.identity,
            amount: 1,
            tokenOwner: tokenOwner.publicKey,
            tokenStandard: TokenStandard.NonFungible,
          }).sendAndConfirm(umi)

        console.log("fetchDigitalAssetWithTokenByMint starting.....");
        const assetToken = await fetchDigitalAssetWithAssociatedToken(umi, mintSigner.publicKey, tokenOwner.publicKey);
        const atatoken = assetToken.token;

        const buyerAta = await createAssociatedToken(connection, payer, metadataInfo.mint, tokenOwnerKeyPair);

        DigitalAssetInfoList.push({
            mint: toWeb3JsPublicKey(umiKeypair.publicKey).toBase58()    ,
            metadata: toWeb3JsPublicKey(asset.metadata.publicKey).toBase58(),
            sellerNftTokenAccount: toWeb3JsPublicKey(atatoken.publicKey).toBase58(),
            buyerNftTokenAccount: buyerAta.toBase58(),
            name: asset.metadata.name,
            Symbol: asset.metadata.symbol,
            creatorsAta: creatorsAtaList,
            creators: creatorsPkList,
        });

        console.log("-------------refresh---creators---------------");
        asset = await fetchDigitalAsset(umi, mintSigner.publicKey);
        creatorList = unwrapOption(asset.metadata.creators, () => []);
        console.log("--------------header------------------");
        console.log("metadata: ", toWeb3JsPublicKey(asset.metadata.publicKey).toBase58());
        console.log("mint: ", toWeb3JsPublicKey(umiKeypair.publicKey).toBase58());
        console.log("ataToken: ", toWeb3JsPublicKey(atatoken.publicKey).toBase58());
        console.log("tokenOwner: ", toWeb3JsPublicKey(sellerUmi.publicKey).toBase58());
        console.log("atatoken amount: ", atatoken.amount);
        for (const creator of creatorList) {
            console.log("creator: ", toWeb3JsPublicKey(creator.address).toBase58());
            console.log("creator share: ", creator.share);
            console.log("creator verified: ", creator.verified);
        }
        console.log("--------------footer------------------");
        idx++;
    }
    const testDigitalAsset: TestDigitalAsset = {
        settlementOldMint: settlementOldMint.publicKey.toBase58(),
        settlementOldAta: destinationOldAta.toBase58(),
        maketdestination: destinationAta.toBase58(),
        sellerDestination: sellerDestinationAta.toBase58(),
        buyersettlementAta: settlementAta,
        settlementMint: settlementMintKey,
        settlementOwner: settlementOwner,
        digitalAssetInfo: DigitalAssetInfoList,
    }
    fs.writeFileSync("test-key-list.yaml", yaml.dump(testDigitalAsset));



})();
