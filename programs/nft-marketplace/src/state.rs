use {
    crate::error::*,
    anchor_lang::{prelude::*, InitSpace},
    mpl_token_metadata::accounts::Metadata,
    solana_program::pubkey::Pubkey,
};

pub const MARKET_SEED: &str = "market";
pub const ESCROW_SEED: &str = "escrow";
pub const COLLECTION_SEED: &str = "collection";
pub const SELL_ORDER_SEED: &str = "sell_order";
pub const NFT_VAULT_SEED: &str = "nft_vault";
pub const BUY_ORDER_SEED: &str = "buy_order";

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub bump: u8,
    pub escrow_bump: u8,
    pub authority: Pubkey,
    pub original_authority: Pubkey,
    pub escrow_authority: Pubkey,
    pub settlement_mint: Pubkey,
    pub fee_basis_points: u16,
    pub fees_destination: Pubkey,
}

#[account]
pub struct Collection {
    pub bump: u8,                      //size 1
    pub market: Pubkey,                //size 32
    pub required_verifier: Pubkey,     //size 32
    pub fee_basis_points: Option<u16>, //Takes priority over comptoir fees //size 1
    pub ignore_creator_fee: bool,      //size 1
    pub name: String,                  //size 4
    pub symbol: String,                //size 4
}

#[account]
#[derive(InitSpace)]
pub struct SellOrder {
    pub bump: u8,
    pub vault_bump: u8,
    pub seller_nft_token_account: Pubkey,
    pub market: Pubkey,
    pub nft_mint: Pubkey,
    pub price: u64,
    pub expires_at: i64,
    pub authority: Pubkey,
    pub destination: Pubkey,
    pub is_sold: bool,
}

#[account]
#[derive(InitSpace)]
pub struct BuyOrder {
    pub bump: u8,
    pub market: Pubkey,
    pub nft_mint: Pubkey,
    pub authority: Pubkey,
    pub price_position: u64,
    pub destination: Pubkey,
    pub expires_at: i64,
    pub is_bought: bool,
}

impl Market {
    pub fn validate_fees(&self) -> Result<()> {
        if self.fee_basis_points > 10000 {
            return Err(NftMarketPlaceError::ErrFeeTooHigh.into());
        }
        Ok(())
    }
}

impl Collection {
    pub const BASE_LEN: usize = 8 + 1 + 32 + 32 + 1 + 1 + 4 + 4;
    pub fn len(&self) -> usize {
        Self::BASE_LEN
            + self.name.len()
            + self.symbol.len()
            + (self.fee_basis_points.map_or(0, |_| 2))
    }
    pub fn calc_len(name: &str, symbol: &str, fees: Option<u16>) -> usize {
        Self::BASE_LEN + name.len() + symbol.len() + (fees.map_or(0, |_| 2))
    }

    pub fn validate_fees(&self) -> Result<()> {
        match self.fee_basis_points {
            Some(fees) if fees > 10000 => {
                return Err(NftMarketPlaceError::ErrFeeTooHigh.into());
            }
            _ => Ok(()),
        }
    }

    pub fn is_part_of_collection(&self, metadata: &Metadata) -> bool {
        return if let Some(creators) = metadata.creators.as_ref() {
            metadata.symbol.starts_with(&self.symbol.to_string())
                && creators
                    .iter()
                    .any(|c| c.address == self.required_verifier && c.verified)
        } else {
            false
        };
    }
}
