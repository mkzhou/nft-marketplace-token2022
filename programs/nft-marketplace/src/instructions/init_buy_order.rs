use {
    crate::{error::*, state::*, utils::verify_metadata_and_derivation},
    anchor_lang::prelude::*,
    anchor_spl::associated_token::AssociatedToken,
    anchor_spl::token_interface::{
        transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

#[derive(Accounts)]
#[instruction(price_position: u64)]
pub struct InitBuyOrder<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        seeds = [
            MARKET_SEED.as_bytes(),
            market.original_authority.as_ref(),
        ],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,
    #[account(
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
        init,
        payer = payer,
        space = 8 + BuyOrder::INIT_SPACE,
        seeds = [
            BUY_ORDER_SEED.as_bytes(),
            market.key().as_ref(),
            nft_mint.key().as_ref(),
            payer.key().as_ref(),
            price_position.to_le_bytes().as_ref(),
        ],
        bump,
    )]
    pub buy_order: Box<Account<'info, BuyOrder>>,

    #[account(
        mint::token_program = paid_token_program,
        constraint = settlement_mint.key() == market.settlement_mint @ NftMarketPlaceError::InvalidSettlementMint,
    )]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        token::token_program = token_program,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        seeds = [
            ESCROW_SEED.as_bytes(),
            market.settlement_mint.key().as_ref(),
            market.key().as_ref(),
        ],
        bump = market.escrow_bump,
    )]
    pub escrow: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::token_program = paid_token_program,
        token::mint = settlement_mint,
        token::authority = payer,
    )]
    pub paid_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::token_program = token_program,
        associated_token::mint = nft_mint,
        associated_token::authority = payer,
    )]
    pub buyer_nft_token_account: InterfaceAccount<'info, TokenAccount>,
    /// CHECK: verified using verify_metadata_and_derivation func
    pub metadata: UncheckedAccount<'info>,

    pub paid_token_program: Interface<'info, TokenInterface>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

impl<'info> InitBuyOrder<'info> {
    pub fn transfer_settlement_token_to_escrow(&self, price_position: u64) -> Result<()> {
        let transfer_amount = price_position
            .checked_mul(10_u64.pow(self.settlement_mint.decimals as u32))
            .unwrap();
        let transfer_accounts = TransferChecked {
            from: self.paid_token_account.to_account_info(),
            to: self.escrow.to_account_info(),
            mint: self.settlement_mint.to_account_info(),
            authority: self.payer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.paid_token_program.to_account_info(), transfer_accounts);
        transfer_checked(cpi_ctx, transfer_amount, self.settlement_mint.decimals)?;
        Ok(())
    }
}

pub fn process_init_buy_order(
    ctx: Context<InitBuyOrder>,
    price_position: u64,
    expires_at: i64,
) -> Result<()> {
    // verify the metadata
    verify_metadata_and_derivation(
        &ctx.accounts.metadata.to_account_info(),
        &ctx.accounts.nft_mint.key(),
        &ctx.accounts.collection,
    )?;

    // transfer settlement token to escrow
    ctx.accounts
        .transfer_settlement_token_to_escrow(price_position)?;
    //init buy order
    let buy_order = &mut ctx.accounts.buy_order;
    buy_order.bump = ctx.bumps.buy_order;
    buy_order.market = ctx.accounts.market.key();
    buy_order.nft_mint = ctx.accounts.nft_mint.key();
    buy_order.authority = ctx.accounts.payer.key();
    buy_order.price_position = price_position;
    buy_order.destination = ctx.accounts.buyer_nft_token_account.key();
    buy_order.expires_at = expires_at;
    buy_order.is_bought = false;
    Ok(())
}
