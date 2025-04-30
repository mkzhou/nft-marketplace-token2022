use {
    crate::state::{Market, ESCROW_SEED, MARKET_SEED},
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
pub struct InitMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            MARKET_SEED.as_bytes(),
            authority.key().as_ref(),
        ],
        bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mint::token_program = token_program,
    )]
    pub settlement_mint: InterfaceAccount<'info, Mint>,

    #[account(
        token::token_program = token_program,
        token::mint = settlement_mint,
    )]
    pub fees_destination: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = authority,
        token::token_program = token_program,
        token::mint = settlement_mint,
        token::authority = escrow,
        seeds = [
            ESCROW_SEED.as_bytes(),
            settlement_mint.key().as_ref(),
            market.key().as_ref(),
        ],
        bump,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

pub fn process_init_market(ctx: Context<InitMarket>, fee_basis_points: u16) -> Result<()> {
    // Initialize the market account
    let market = &mut ctx.accounts.market;
    market.bump = ctx.bumps.market;
    market.escrow_bump = ctx.bumps.escrow;
    market.original_authority = ctx.accounts.authority.key();
    market.authority = ctx.accounts.authority.key();
    market.escrow_authority = ctx.accounts.authority.key();
    market.settlement_mint = ctx.accounts.settlement_mint.key();
    market.fee_basis_points = fee_basis_points;
    market.fees_destination = ctx.accounts.fees_destination.key();

    market.validate_fees()?;
    Ok(())
}
