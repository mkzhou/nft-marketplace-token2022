use {
    crate::error::NftMarketPlaceError,
    crate::state::{Collection, Market, COLLECTION_SEED, MARKET_SEED},
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
#[instruction(optional_fee: Option<u16>, optional_symbol: Option<String>)]
pub struct UpdateCollection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [
            MARKET_SEED.as_bytes(),
            market.original_authority.as_ref(),
        ],
        bump = market.bump,
        has_one = authority,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        realloc = Collection::calc_len(&collection.name, &optional_symbol.clone().unwrap_or("".to_string()), optional_fee),
        realloc::payer = authority,
        realloc::zero = false,
        seeds = [
            COLLECTION_SEED.as_bytes(),
            market.key().as_ref(),
            collection.name.as_bytes(),
        ],
        bump = collection.bump,
        constraint = collection.market == market.key() @ NftMarketPlaceError::InvalidMarket,
    )]
    pub collection: Box<Account<'info, Collection>>,

    pub system_program: Program<'info, System>,
}

pub fn process_update_collection(
    ctx: Context<UpdateCollection>,
    optional_fee: Option<u16>,
    optional_symbol: Option<String>,
    optional_required_verifier: Option<Pubkey>,
    optional_ignore_creator_fee: Option<bool>,
) -> Result<()> {
    let collection = &mut ctx.accounts.collection;
    // Update the collection
    if let Some(symbol) = optional_symbol {
        collection.symbol = symbol;
    }
    if let Some(fee) = optional_fee {
        collection.fee_basis_points = Some(fee);
    }
    if let Some(required_verifier) = optional_required_verifier {
        collection.required_verifier = required_verifier;
    }
    if let Some(ignore_creator_fee) = optional_ignore_creator_fee {
        collection.ignore_creator_fee = ignore_creator_fee;
    }
    collection.validate_fees()?;
    Ok(())
}
