mod error;
mod event;
mod instructions;
mod state;
mod utils;

use anchor_lang::prelude::*;
use instructions::*;

declare_id!("2HJJy6niXFRWNF1oyyiFYJAvrrvtWPGrNovov8NUX4xh");

#[program]
pub mod nft_marketplace {
    use super::*;

    pub fn init_market(ctx: Context<InitMarket>, fee_basis_points: u16) -> Result<()> {
        process_init_market(ctx, fee_basis_points)
    }

    pub fn update_market(
        ctx: Context<UpdateMarket>,
        optional_fees: Option<u16>,
        optional_fees_destination: Option<Pubkey>,
        optional_authority: Option<Pubkey>,
    ) -> Result<()> {
        process_update_market(
            ctx,
            optional_fees,
            optional_fees_destination,
            optional_authority,
        )
    }

    pub fn update_market_mint(
        ctx: Context<UpdateMarketMint>,
        fee_destination: Pubkey,
    ) -> Result<()> {
        process_update_market_mint(ctx, fee_destination)
    }

    pub fn init_collection(
        ctx: Context<InitCollection>,
        name: String,
        symbol: String,
        fee: Option<u16>,
        required_verifier: Pubkey,
        ignore_fee: bool,
    ) -> Result<()> {
        process_init_collection(ctx, name, symbol, fee, required_verifier, ignore_fee)
    }

    pub fn update_collection(
        ctx: Context<UpdateCollection>,
        optional_fee: Option<u16>,
        optional_symbol: Option<String>,
        optional_required_verifier: Option<Pubkey>,
        optional_ignore_creator_fee: Option<bool>,
    ) -> Result<()> {
        process_update_collection(
            ctx,
            optional_fee,
            optional_symbol,
            optional_required_verifier,
            optional_ignore_creator_fee,
        )
    }

    pub fn init_sell_order(ctx: Context<InitSellOrder>, price: u64, expires_at: i64) -> Result<()> {
        process_init_sell_order(ctx, price, expires_at)
    }

    pub fn buy_nft<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BuyNft<'info>>,
    ) -> Result<()> {
        process_buy_nft(ctx)
    }

    pub fn close_sell_order(ctx: Context<CloseSellOrder>) -> Result<()> {
        process_close_sell_order(ctx)
    }

    pub fn init_buy_order(
        ctx: Context<InitBuyOrder>,
        price_position: u64,
        expires_at: i64,
    ) -> Result<()> {
        process_init_buy_order(ctx, price_position, expires_at)
    }

    pub fn match_buy_order<'a, 'b, 'c: 'info, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, MatchBuyOrder<'info>>,
    ) -> Result<()> {
        process_match_buy_order(ctx)
    }

    pub fn close_buy_order(ctx: Context<CloseBuyOrder>) -> Result<()> {
        process_close_buy_order(ctx)
    }
}
