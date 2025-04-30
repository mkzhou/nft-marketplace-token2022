use {
    crate::state::{Market, MARKET_SEED},
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
pub struct UpdateMarket<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.original_authority.as_ref(),
        ],
        bump = market.bump,
        has_one = authority,
    )]
    pub market: Account<'info, Market>,
}

pub fn process_update_market(
    ctx: Context<UpdateMarket>,
    optional_fees: Option<u16>,
    optional_fees_destination: Option<Pubkey>,
    optional_authority: Option<Pubkey>,
) -> Result<()> {
    let market = &mut ctx.accounts.market;
    //update then fees
    if let Some(fees) = optional_fees {
        market.fee_basis_points = fees;
    }
    //update the fees destination
    if let Some(destination) = optional_fees_destination {
        market.fees_destination = destination;
    }
    //update the authority
    if let Some(authority) = optional_authority {
        market.authority = authority;
    }
    // validate the fees
    market.validate_fees()?;
    Ok(())
}
