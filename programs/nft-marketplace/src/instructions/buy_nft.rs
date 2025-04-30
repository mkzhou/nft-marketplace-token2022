use {
    crate::{
        error::*,
        event::NftBought,
        state::*,
        utils::{
            calculate_creator_fees, pay, verify_and_get_creators, verify_metadata_and_derivation,
        },
    },
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{
        transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

#[derive(Accounts)]
pub struct BuyNft<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub market: Box<Account<'info, Market>>,

    /// CHECK: market_destination is checked by the constraint
    #[account(
        mut,
        constraint = market_destination.key() == market.fees_destination.key(),
    )]
    pub market_destination: UncheckedAccount<'info>,

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
        mut,
        seeds = [
            SELL_ORDER_SEED.as_bytes(),
            sell_order.seller_nft_token_account.as_ref(),
            sell_order.price.to_le_bytes().as_ref(),
        ],
        bump = sell_order.bump,
        constraint = sell_order.is_sold == false @ NftMarketPlaceError::NftAlreadySold,
        constraint = sell_order.nft_mint == nft_mint.key() @ NftMarketPlaceError::InvalidNftMint,
        constraint = sell_order.market == market.key() @ NftMarketPlaceError::InvalidMarket,
        constraint = sell_order.expires_at > Clock::get()?.unix_timestamp @ NftMarketPlaceError::SellOrderExpired,
    )]
    pub sell_order: Box<Account<'info, SellOrder>>,

    /// CHECK: seller_destination is checked by the constraint
    #[account(
        mut,
        constraint = seller_destination.key() == sell_order.destination @ NftMarketPlaceError::InvalidSellerDestination,
    )]
    pub seller_destination: UncheckedAccount<'info>,

    #[account(
        mut,
        token::token_program = paid_token_program,
        token::mint = settlement_mint,
        token::authority = buyer,
    )]
    pub paid_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        mint::token_program = paid_token_program,
        constraint = settlement_mint.key() == market.settlement_mint @ NftMarketPlaceError::InvalidSettlementMint,
    )]
    pub settlement_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::token_program = token_program,
        token::mint = nft_mint,
        token::authority = buyer,
    )]
    pub buyer_nft_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        mint::token_program = token_program,
        constraint = nft_mint.key() == sell_order.nft_mint @ NftMarketPlaceError::InvalidNftMint,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::token_program = token_program,
        token::mint = nft_mint,
        seeds = [
            NFT_VAULT_SEED.as_bytes(),
            nft_mint.key().as_ref(),
        ],
        bump = sell_order.vault_bump,
    )]
    pub nft_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: verified using verify_metadata_and_derivation func
    pub metadata: UncheckedAccount<'info>,

    pub paid_token_program: Interface<'info, TokenInterface>,

    pub token_program: Interface<'info, TokenInterface>,

    pub system_program: Program<'info, System>,
}

impl<'info> BuyNft<'info> {
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
            to: self.buyer_nft_token_account.to_account_info(),
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

    pub fn transfer_fees(&self, recipient: AccountInfo<'info>, amount: u64) -> Result<()> {
        pay(
            self.paid_token_account.to_account_info(),
            recipient,
            self.buyer.to_account_info(),
            self.paid_token_program.clone().to_account_info(),
            self.settlement_mint.to_account_info(),
            self.settlement_mint.decimals,
            amount,
        )
    }

    pub fn pay_creator_fees(
        &self,
        creators_fees_idx: Vec<(usize, u64)>,
        remaining_accounts: &[AccountInfo<'info>],
    ) -> Result<()> {
        for (creator_account_idx, creator_fee) in creators_fees_idx {
            pay(
                self.paid_token_account.to_account_info(),
                remaining_accounts[creator_account_idx].to_account_info(),
                self.buyer.to_account_info(),
                self.paid_token_program.clone().to_account_info(),
                self.settlement_mint.to_account_info(),
                self.settlement_mint.decimals,
                creator_fee,
            )?;
        }
        Ok(())
    }
}

pub fn process_buy_nft<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BuyNft<'info>>,
) -> Result<()> {
    // verify the metadata
    let metadata = verify_metadata_and_derivation(
        &ctx.accounts.metadata.to_account_info(),
        &ctx.accounts.nft_mint.key(),
        &ctx.accounts.collection,
    )?;

    //get the creator distributions info
    let mut creators_distributions_option = None;
    if !ctx.accounts.collection.ignore_creator_fee {
        if let Some(creators) = metadata.creators {
            msg!("metadata.creators.len: {:?}", creators.len());
            let creators_distributions = verify_and_get_creators(
                creators,
                ctx.remaining_accounts,
                ctx.accounts.market.settlement_mint,
                ctx.accounts.paid_token_program.key(),
            )?;
            creators_distributions_option = Some(creators_distributions);
        }
    }

    let total_cost = ctx.accounts.sell_order.price.checked_mul(10_000).unwrap();

    //calculate the market fee_basis_points
    let market_fee_poinsts = ctx
        .accounts
        .collection
        .fee_basis_points
        .unwrap_or(ctx.accounts.market.fee_basis_points);

    //calculate the market fee
    let market_fee = ctx
        .accounts
        .sell_order
        .price
        .checked_mul(market_fee_poinsts as u64)
        .unwrap();

    msg!("market_fee_poinsts: {}", market_fee_poinsts);
    msg!(
        "seller_fee_basis_points: {}",
        metadata.seller_fee_basis_points
    );

    //calculate the creator fee
    let mut creators_share: u64 = 0;
    if !ctx.accounts.collection.ignore_creator_fee {
        creators_share = ctx
            .accounts
            .sell_order
            .price
            .checked_mul(metadata.seller_fee_basis_points as u64)
            .unwrap();
    }

    msg!("creators_share: {}", creators_share);
    msg!("market_fee: {}", market_fee);
    //calculate the seller fee
    let seller_fee = total_cost
        .checked_sub(market_fee)
        .unwrap()
        .checked_sub(creators_share)
        .unwrap();

    msg!("seller_fee: {}", seller_fee);
    //transfer the nft
    ctx.accounts.transfer_nft()?;
    //transfer the market fee

    ctx.accounts.transfer_fees(
        ctx.accounts.market_destination.to_account_info(),
        market_fee,
    )?;

    //transfer the seller fee
    ctx.accounts.transfer_fees(
        ctx.accounts.seller_destination.to_account_info(),
        seller_fee,
    )?;

    //transfer the creator fee
    if let Some(creators) = creators_distributions_option.as_ref() {
        let creators_fees_idx = calculate_creator_fees(creators_share, creators);
        ctx.accounts
            .pay_creator_fees(creators_fees_idx, ctx.remaining_accounts)?;
    }
    //emit event
    emit!(NftBought {
        sell_order: ctx.accounts.sell_order.key(),
        buyer: ctx.accounts.buyer.key(),
    });
    //close the sell order
    let sell_order = &mut ctx.accounts.sell_order;
    sell_order.is_sold = true;
    Ok(())
}
