use {
    crate::{
        error::*,
        state::{Market, ESCROW_SEED, MARKET_SEED},
        ID,
    },
    anchor_lang::prelude::*,
    anchor_spl::{
        token::{close_account, CloseAccount},
        token_interface::{Mint, TokenAccount, TokenInterface},
    },
};

#[derive(Accounts)]
pub struct UpdateMarketMint<'info> {
    #[account(mut)]
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
    #[account(
        mut,
        mint::token_program = token_program,
    )]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::token_program = token_program,
        token::mint = settlement_mint
    )]
    pub fees_destination: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
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

    /// CHECK: This account is to close the old escrow account
    #[account(mut)]
    pub old_escrow: UncheckedAccount<'info>,

    /// CHECK: This account is to receive the lamport when close the old escrow account
    #[account(
        mut,
        constraint = old_escrow_authority.key() == market.escrow_authority @ NftMarketPlaceError::OldEscrowAuthMismatch,
    )]
    pub old_escrow_authority: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

impl<'info> UpdateMarketMint<'info> {
    pub fn close_old_escrow(&self) -> Result<()> {
        msg!("old_escrow: {}", self.old_escrow.key());
        let (old_escrow_pda, escrow_bump) = Pubkey::find_program_address(
            &[
                ESCROW_SEED.as_bytes(),
                self.market.settlement_mint.as_ref(),
                self.market.key().as_ref(),
            ],
            &ID,
        );
        msg!("old_escrow_pda: {}", old_escrow_pda);
        if old_escrow_pda != self.old_escrow.key() {
            return Err(NftMarketPlaceError::OldEscrowMismatch.into());
        }

        let market_key = self.market.key();
        let signer_seeds: &[&[&[u8]]] = &[&[
            ESCROW_SEED.as_bytes(),
            self.market.settlement_mint.as_ref(),
            market_key.as_ref(),
            &[escrow_bump],
        ]];
        let close_accounts = CloseAccount {
            account: self.old_escrow.to_account_info(),
            destination: self.old_escrow_authority.to_account_info(),
            authority: self.old_escrow.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            close_accounts,
            signer_seeds,
        );
        close_account(cpi_ctx)?;
        Ok(())
    }
}

pub fn process_update_market_mint(
    ctx: Context<UpdateMarketMint>,
    fee_destination: Pubkey,
) -> Result<()> {
    // Close the old escrow account
    ctx.accounts.close_old_escrow()?;
    // Update the market account
    let market = &mut ctx.accounts.market;
    market.settlement_mint = ctx.accounts.settlement_mint.key();
    market.escrow_authority = ctx.accounts.authority.key();
    market.fees_destination = fee_destination;
    market.escrow_bump = ctx.bumps.escrow;
    Ok(())
}
