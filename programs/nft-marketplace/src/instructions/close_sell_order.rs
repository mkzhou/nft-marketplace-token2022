use {
    crate::{error::*, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{
        transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

#[derive(Accounts)]
pub struct CloseSellOrder<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [
            SELL_ORDER_SEED.as_bytes(),
            sell_order.seller_nft_token_account.as_ref(),
            sell_order.price.to_le_bytes().as_ref(),
        ],
        bump = sell_order.bump,
        has_one = authority,
        close = authority,
    )]
    pub sell_order: Account<'info, SellOrder>,

    #[account(
        mut,
        constraint = nft_mint.key() == sell_order.nft_mint @ NftMarketPlaceError::InvalidNftMint,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = seller_nft_token_account.key() == sell_order.seller_nft_token_account @ NftMarketPlaceError::InvalidSellerNftTokenAccount,
    )]
    pub seller_nft_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            NFT_VAULT_SEED.as_bytes(),
            nft_mint.key().as_ref(),
        ],
        bump = sell_order.vault_bump,
    )]
    pub nft_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

impl<'info> CloseSellOrder<'info> {
    pub fn transfer_nft(&self) -> Result<()> {
        let nft_mint_key = self.nft_mint.key();
        let signer_seeds = &[
            NFT_VAULT_SEED.as_bytes(),
            nft_mint_key.as_ref(),
            &[self.sell_order.vault_bump],
        ];
        let signer = &[&signer_seeds[..]];
        let transfer_nft_accounts = TransferChecked {
            from: self.nft_vault.to_account_info(),
            to: self.seller_nft_token_account.to_account_info(),
            mint: self.nft_mint.to_account_info(),
            authority: self.nft_vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            transfer_nft_accounts,
            signer,
        );
        transfer_checked(cpi_ctx, 1, self.nft_mint.decimals)?;
        Ok(())
    }
}

pub fn process_close_sell_order(ctx: Context<CloseSellOrder>) -> Result<()> {
    //transfer the nft to the seller
    if !ctx.accounts.sell_order.is_sold {
        ctx.accounts.transfer_nft()?;
    }

    //close the sell order
    let sell_order = &mut ctx.accounts.sell_order;
    sell_order.expires_at = Clock::get()?.unix_timestamp;
    Ok(())
}
