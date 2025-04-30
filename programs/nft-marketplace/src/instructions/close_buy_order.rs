use {
    crate::{error::NftMarketPlaceError, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{
        transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

#[derive(Accounts)]
pub struct CloseBuyOrder<'info> {
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
        mut,
        has_one = authority,
        constraint = buy_order.market == market.key() @ NftMarketPlaceError::InvalidMarket,
        close = authority,
    )]
    pub buy_order: Account<'info, BuyOrder>,
    #[account(
        constraint = settlement_mint.key() == market.settlement_mint @ NftMarketPlaceError::InvalidSettlementMint,
    )]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [
            ESCROW_SEED.as_bytes(),
            settlement_mint.key().as_ref(),
            market.key().as_ref(),
        ],
        bump = market.escrow_bump,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = settlement_mint,
        token::token_program = token_program,
        token::authority = authority,
    )]
    pub receive_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

impl<'info> CloseBuyOrder<'info> {
    pub fn transfer_settlement_token(&self) -> Result<()> {
        let market_key = self.market.key();
        let settlement_mint_key = self.settlement_mint.key();
        let signer_seeds = &[
            ESCROW_SEED.as_bytes(),
            settlement_mint_key.as_ref(),
            market_key.as_ref(),
            &[self.market.escrow_bump],
        ];

        let signer = &[&signer_seeds[..]];
        let transfer_amount = self
            .buy_order
            .price_position
            .checked_mul(10_u64.pow(self.settlement_mint.decimals as u32))
            .unwrap();
        let transfer_accounts = TransferChecked {
            from: self.escrow.to_account_info(),
            to: self.receive_token_account.to_account_info(),
            mint: self.settlement_mint.to_account_info(),
            authority: self.escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            transfer_accounts,
            signer,
        );
        transfer_checked(cpi_ctx, transfer_amount, self.settlement_mint.decimals)
    }
}

pub fn process_close_buy_order(ctx: Context<CloseBuyOrder>) -> Result<()> {
    //transfer the settlement token to the receive token account
    if !ctx.accounts.buy_order.is_bought {
        ctx.accounts.transfer_settlement_token()?;
    }
    Ok(())
}
