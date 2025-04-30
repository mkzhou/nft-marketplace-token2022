use anchor_lang::error_code;

#[error_code]
pub enum NftMarketPlaceError {
    #[msg("Fee basis points must be less than 10000")]
    ErrFeeTooHigh,
    #[msg("Old escrow mismatch")]
    OldEscrowMismatch,
    #[msg("Old escrow authority mismatch")]
    OldEscrowAuthMismatch,
    #[msg("Invalid market")]
    InvalidMarket,
    #[msg("Not initialized")]
    NotInitialized,
    #[msg("Nft not part of collection")]
    ErrNftNotPartOfCollection,
    #[msg("Invalid nft amount")]
    InvalidNftAmount,
    #[msg("Derived key invalid")]
    DerivedKeyInvalid,
    #[msg("Invalid settlement mint")]
    InvalidSettlementMint,
    #[msg("Invalid nft mint")]
    InvalidNftMint,
    #[msg("Nft already sold")]
    NftAlreadySold,
    #[msg("Invalid seller destination")]
    InvalidSellerDestination,
    #[msg("Sell order expired")]
    SellOrderExpired,
    #[msg("Invalid escrow")]
    InvalidEscrow,
    #[msg("Invalid seller nft token account")]
    InvalidSellerNftTokenAccount,
    #[msg("Buy order expired")]
    BuyOrderExpired,
    #[msg("Buy order already bought")]
    BuyOrderAlreadyBought,
    #[msg("Invalid buyer destination")]
    InvalidBuyerDestination,
    #[msg("Invalid creators count")]
    InvalidCreatorsCount,
    #[msg("Invalid authority")]
    InvalidAuthority,
    #[msg("Sell order already sold")]
    SellOrderAlreadySold,
    #[msg("Nft already bought")]
    NftAlreadyBought,
}
