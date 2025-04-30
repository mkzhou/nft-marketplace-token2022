use {
    crate::state::{Collection, Market, COLLECTION_SEED, MARKET_SEED},
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
#[instruction(name: String, symbol: String, fee: Option<u16>)]
pub struct InitCollection<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [
            MARKET_SEED.as_bytes(),
            market.original_authority.as_ref(),
        ],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        space = Collection::calc_len(&name, &symbol, fee),
        seeds = [
            COLLECTION_SEED.as_bytes(),
            market.key().as_ref(),
            name.as_bytes(),
        ],
        bump,
    )]
    pub collection: Account<'info, Collection>,
    pub system_program: Program<'info, System>,
}

pub fn process_init_collection(
    ctx: Context<InitCollection>,
    name: String,
    symbol: String,
    fee: Option<u16>,
    required_verifier: Pubkey,
    ignore_fee: bool,
) -> Result<()> {
    // Initialize the collection account
    let collection = &mut ctx.accounts.collection;
    collection.bump = ctx.bumps.collection;
    collection.market = ctx.accounts.market.key();
    collection.required_verifier = required_verifier;
    collection.fee_basis_points = fee;
    collection.ignore_creator_fee = ignore_fee;
    collection.name = name;
    collection.symbol = symbol;

    // Validate the collection fees
    collection.validate_fees()?;
    Ok(())
}
