use {
    crate::{error::*, state::*, utils::verify_metadata_and_derivation},
    anchor_lang::prelude::*,
    anchor_spl::token::{transfer_checked, TransferChecked},
    anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
#[instruction(price: u64)]
pub struct InitSellOrder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            MARKET_SEED.as_bytes(),
            market.original_authority.as_ref(),
        ],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
        mut,
        seeds = [
            COLLECTION_SEED.as_bytes(),
            market.key().as_ref(),
            collection.name.as_bytes(),
        ],
        bump = collection.bump,
        constraint = collection.market == market.key() @ NftMarketPlaceError::InvalidMarket,
    )]
    pub collection: Box<Account<'info, Collection>>,
    #[account(
        mut,
        token::token_program = token_program,
        token::mint = nft_mint,
        constraint = seller_nft_token_account.amount == 1 @ NftMarketPlaceError::InvalidNftAmount,
    )]
    pub seller_nft_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        mint::token_program = token_program,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = payer,
        token::token_program = token_program,
        token::mint = nft_mint,
        token::authority = nft_vault,
        seeds = [
            NFT_VAULT_SEED.as_bytes(),
            nft_mint.key().as_ref(),
        ],
        bump,
    )]
    pub nft_vault: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: verified using verify_metadata_and_derivation func
    pub metadata: UncheckedAccount<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + SellOrder::INIT_SPACE,
        seeds = [
            SELL_ORDER_SEED.as_bytes(),
            seller_nft_token_account.key().as_ref(),
            price.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub sell_order: Box<Account<'info, SellOrder>>,

    #[account(
        constraint = destination.mint == market.settlement_mint @ NftMarketPlaceError::InvalidSellerDestination,
    )]
    pub destination: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitSellOrder<'info> {
    pub fn transfer_nft_to_vault(&self) -> Result<()> {
        let transfer_accounts = TransferChecked {
            from: self.seller_nft_token_account.to_account_info(),
            to: self.nft_vault.to_account_info(),
            mint: self.nft_mint.to_account_info(),
            authority: self.payer.to_account_info(),
        };
        let transfer_cpi_ctx =
            CpiContext::new(self.token_program.to_account_info(), transfer_accounts);

        transfer_checked(transfer_cpi_ctx, 1, self.nft_mint.decimals)?;
        Ok(())
    }
}

pub fn process_init_sell_order(
    ctx: Context<InitSellOrder>,
    price: u64,
    expires_at: i64,
) -> Result<()> {
    msg!("init sell order");
    //verify metadata
    verify_metadata_and_derivation(
        &ctx.accounts.metadata,
        &ctx.accounts.nft_mint.key(),
        &ctx.accounts.collection,
    )?;
    //transfer nft to nft vault
    ctx.accounts.transfer_nft_to_vault()?;
    //initialize sell order
    let sell_order = &mut ctx.accounts.sell_order;
    sell_order.bump = ctx.bumps.sell_order;
    sell_order.vault_bump = ctx.bumps.nft_vault;
    sell_order.seller_nft_token_account = ctx.accounts.seller_nft_token_account.key();
    sell_order.market = ctx.accounts.market.key();
    sell_order.nft_mint = ctx.accounts.nft_mint.key();
    sell_order.authority = ctx.accounts.payer.key();
    sell_order.destination = ctx.accounts.destination.key();
    sell_order.price = price;
    sell_order.expires_at = expires_at;
    sell_order.is_sold = false;
    Ok(())
}
