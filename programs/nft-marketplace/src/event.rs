use anchor_lang::prelude::*;

#[event]
pub struct NftBought {
    pub sell_order: Pubkey,
    pub buyer: Pubkey,
}

#[event]
pub struct NftSold {
    pub buy_order: Pubkey,
    pub seller: Pubkey,
    pub sell_order: Option<Pubkey>,
}
