use {
    crate::{error::NftMarketPlaceError, state::Collection},
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::get_associated_token_address_with_program_id,
        token_interface::{transfer_checked, TransferChecked},
    },
    mpl_token_metadata::{accounts::Metadata, types::Creator},
};

pub fn assert_derivation(nft_mint: &Pubkey, account: &AccountInfo) -> Result<u8> {
    let (key, bump) = Metadata::find_pda(nft_mint);
    msg!("assert derivation {}", key);
    if key != *account.key {
        return Err(NftMarketPlaceError::DerivedKeyInvalid.into());
    }
    Ok(bump)
}

pub fn verify_metadata_and_derivation(
    unverified_metadata: &AccountInfo,
    nft_mint: &Pubkey,
    collection: &Collection,
) -> Result<Metadata> {
    msg!("verify metadata and derivation {}", unverified_metadata.key);
    if unverified_metadata.data_is_empty() {
        return Err(error!(NftMarketPlaceError::NotInitialized));
    };
    assert_derivation(nft_mint, unverified_metadata)?;

    let metadata = Metadata::try_from(unverified_metadata)?;
    msg!("metadata name :{}", metadata.name);
    if !collection.is_part_of_collection(&metadata) {
        return Err(error!(NftMarketPlaceError::ErrNftNotPartOfCollection));
    }
    return Ok(metadata);
}

pub fn verify_and_get_creators<'a, 'b, 'c, 'info>(
    creators: Vec<Creator>,
    remaining_accounts: &'c [AccountInfo<'info>],
    settlement_mint: Pubkey,
    token_program: Pubkey,
) -> Result<Vec<(usize, u8)>> {
    let is_native = settlement_mint == spl_token::native_mint::id();
    let mut creators_distributions = Vec::new();
    msg!("remaining_accounts.len: {}", remaining_accounts.len());
    require!(
        remaining_accounts.len() >= creators.len(),
        NftMarketPlaceError::InvalidCreatorsCount
    );
    for (_, creator) in creators.iter().enumerate() {
        let token_addr: Pubkey;
        if is_native {
            token_addr = creator.address;
        } else {
            token_addr = get_associated_token_address_with_program_id(
                &creator.address,
                &settlement_mint,
                &token_program,
            );
        }
        let remaining_idx = remaining_accounts
            .iter()
            .position(|c| c.key() == token_addr)
            .unwrap();
        msg!("remaining_idx: {}", remaining_idx);
        msg!("creator.share: {}", creator.share);
        creators_distributions.push((remaining_idx, creator.share));
    }

    return Ok(creators_distributions);
}

pub fn calculate_creator_fees(
    creator_total_fee: u64,
    creators_distributions: &Vec<(usize, u8)>,
) -> Vec<(usize, u64)> {
    let mut distribution_fee = 0;
    let mut creators_fees_idx = Vec::new();
    for i in 0..creators_distributions.len() {
        let (createtor_account_idx, creator_share_percentage) = creators_distributions[i];
        let creator_fee = if i == creators_distributions.len() - 1 {
            creator_total_fee.checked_sub(distribution_fee).unwrap()
        } else {
            creator_total_fee
                .checked_mul(creator_share_percentage as u64)
                .unwrap()
                .checked_div(100)
                .unwrap()
        };
        distribution_fee = distribution_fee.checked_add(creator_fee).unwrap();
        creators_fees_idx.push((createtor_account_idx, creator_fee));
    }
    creators_fees_idx
}

pub fn pay<'info>(
    payer: AccountInfo<'info>,
    dest: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    decimals: u8,
    amount: u64,
) -> Result<()> {
    let transfer_fees = amount
        .checked_mul(10_u64.pow(decimals as u32))
        .unwrap()
        .checked_div(10_000)
        .unwrap();
    let transfer_fees_accounts = TransferChecked {
        from: payer,
        to: dest,
        mint: mint,
        authority,
    };
    let cpi_ctx = CpiContext::new(token_program, transfer_fees_accounts);
    transfer_checked(cpi_ctx, transfer_fees, decimals)?;
    Ok(())
}

pub fn pay_with_signer<'info>(
    payer: AccountInfo<'info>,
    dest: AccountInfo<'info>,
    authority: AccountInfo<'info>,
    token_program: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    decimals: u8,
    amount: u64,
    signer: &[&[&[u8]]],
) -> Result<()> {
    let transfer_fees = amount
        .checked_mul(10_u64.pow(decimals as u32))
        .unwrap()
        .checked_div(10_000)
        .unwrap();
    let transfer_fees_accounts = TransferChecked {
        from: payer,
        to: dest,
        mint: mint,
        authority,
    };
    let cpi_ctx = CpiContext::new_with_signer(token_program, transfer_fees_accounts, signer);
    transfer_checked(cpi_ctx, transfer_fees, decimals)?;
    Ok(())
}
