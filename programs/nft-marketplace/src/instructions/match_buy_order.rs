use {
    crate::{
        error::*,
        event::NftSold,
        state::*,
        utils::{
            calculate_creator_fees, pay_with_signer, verify_and_get_creators,
            verify_metadata_and_derivation,
        },
    },
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{
        transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
    },
};

#[derive(Accounts)]
pub struct MatchBuyOrder<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
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
    /// CHECK: market_destination is checked by the constraint
    #[account(
        mut,
        constraint = market_destination.key() == market.fees_destination.key(),
    )]
    pub market_destination: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [
            BUY_ORDER_SEED.as_bytes(),
            market.key().as_ref(),
            nft_mint.key().as_ref(),
            buy_order.authority.as_ref(),
            buy_order.price_position.to_le_bytes().as_ref(),
        ],
        bump = buy_order.bump,
        constraint = buy_order.is_bought == false @ NftMarketPlaceError::BuyOrderAlreadyBought,
        constraint = buy_order.expires_at > Clock::get()?.unix_timestamp @ NftMarketPlaceError::BuyOrderExpired,
    )]
    pub buy_order: Box<Account<'info, BuyOrder>>,
    #[account(
        constraint = nft_mint.key() == buy_order.nft_mint @ NftMarketPlaceError::InvalidNftMint,
    )]
    pub nft_mint: InterfaceAccount<'info, Mint>,
    #[account(
        constraint = settlement_mint.key() == market.settlement_mint @ NftMarketPlaceError::InvalidSettlementMint,
    )]
    pub settlement_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        constraint = buyer_nft_token_account.key() == buy_order.destination @ NftMarketPlaceError::InvalidBuyerDestination,
    )]
    pub buyer_nft_token_account: InterfaceAccount<'info, TokenAccount>,
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
    )]
    pub seller_destination: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: verified using verify_metadata_and_derivation func
    pub metadata: UncheckedAccount<'info>,
    pub paid_token_program: Interface<'info, TokenInterface>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

impl<'info> MatchBuyOrder<'info> {
    pub fn transfer_nft_from_vault(&self, nft_valut: AccountInfo<'info>, bump: u8) -> Result<()> {
        let nft_mint_key = self.nft_mint.key();
        let signer_seeds = &[NFT_VAULT_SEED.as_bytes(), nft_mint_key.as_ref(), &[bump]];

        let signer = &[&signer_seeds[..]];
        let transfer_account = TransferChecked {
            from: nft_valut.to_account_info(),
            to: self.buyer_nft_token_account.to_account_info(),
            mint: self.nft_mint.to_account_info(),
            authority: nft_valut.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            self.token_program.to_account_info(),
            transfer_account,
            signer,
        );
        transfer_checked(cpi_ctx, 1, self.nft_mint.decimals)
    }

    pub fn transfer_nft(&self, nft_valut: AccountInfo<'info>) -> Result<()> {
        let transfer_account = TransferChecked {
            from: nft_valut.to_account_info(),
            to: self.buyer_nft_token_account.to_account_info(),
            mint: self.nft_mint.to_account_info(),
            authority: self.seller.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.token_program.to_account_info(), transfer_account);
        transfer_checked(cpi_ctx, 1, self.nft_mint.decimals)
    }

    pub fn transfer_fees(&self, recipient: AccountInfo<'info>, amount: u64) -> Result<()> {
        let market_key: Pubkey = self.market.key();
        let settlement_mint_key = self.settlement_mint.key();
        let signer_seeds = &[
            ESCROW_SEED.as_bytes(),
            settlement_mint_key.as_ref(),
            market_key.as_ref(),
            &[self.market.escrow_bump],
        ];

        let signer = &[&signer_seeds[..]];
        pay_with_signer(
            self.escrow.to_account_info(),
            recipient,
            self.escrow.to_account_info(),
            self.paid_token_program.to_account_info(),
            self.settlement_mint.to_account_info(),
            self.settlement_mint.decimals,
            amount,
            signer,
        )
    }

    pub fn pay_creator_fees(
        &self,
        creators_fees_idx: Vec<(usize, u64)>,
        remaining_accounts: &[AccountInfo<'info>],
    ) -> Result<()> {
        let market_key = self.market.key();
        let settlement_mint_key = self.settlement_mint.key();
        let signer_seeds = &[
            ESCROW_SEED.as_bytes(),
            settlement_mint_key.as_ref(),
            market_key.as_ref(),
            &[self.market.escrow_bump],
        ];

        let signer = &[&signer_seeds[..]];
        for (creator_account_idx, creator_fee) in creators_fees_idx {
            pay_with_signer(
                self.escrow.to_account_info(),
                remaining_accounts[creator_account_idx].to_account_info(),
                self.escrow.to_account_info(),
                self.paid_token_program.clone().to_account_info(),
                self.settlement_mint.to_account_info(),
                self.settlement_mint.decimals,
                creator_fee,
                signer,
            )?;
        }
        Ok(())
    }
}

pub fn process_match_buy_order<'a, 'b, 'c: 'info, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, MatchBuyOrder<'info>>,
) -> Result<()> {
    //verify the nft metadata
    let metadata = verify_metadata_and_derivation(
        &ctx.accounts.metadata,
        &ctx.accounts.nft_mint.key(),
        &ctx.accounts.collection,
    )?;

    //get the seller nft token account or nft vault
    let seller_nft_token_account = if ctx.remaining_accounts.len() > 0 {
        InterfaceAccount::<'info, TokenAccount>::try_from(&ctx.remaining_accounts[0])?
    } else {
        return Err(NftMarketPlaceError::InvalidSellerNftTokenAccount.into());
    };

    require_eq!(
        seller_nft_token_account.amount,
        1,
        NftMarketPlaceError::InvalidSellerNftTokenAccount
    );
    require_eq!(
        seller_nft_token_account.mint,
        ctx.accounts.nft_mint.key(),
        NftMarketPlaceError::InvalidSellerNftTokenAccount
    );

    let mut creators_count = 0;
    //get the creator distributions info
    let mut creators_distributions_option = None;
    if !ctx.accounts.collection.ignore_creator_fee {
        if let Some(creators) = metadata.creators {
            let creators_distributions = verify_and_get_creators(
                creators,
                ctx.remaining_accounts,
                ctx.accounts.market.settlement_mint,
                ctx.accounts.paid_token_program.key(),
            )?;
            creators_distributions_option = Some(creators_distributions);
            creators_count = creators_distributions_option
                .as_ref()
                .map_or(0, |creators| creators.len());
        }
    }

    //verify the sell order
    let mut sell_order_option: Option<Pubkey> = None;
    let mut nft_vault_bump: Option<u8> = None;
    if ctx.remaining_accounts.len() > creators_count + 1 {
        let sell_order_result =
            Account::<'info, SellOrder>::try_from(&ctx.remaining_accounts[creators_count + 1]);
        if let Ok(mut sell_order) = sell_order_result {
            msg!(
                "remaining_accounts seller_nft_token_account: {}",
                sell_order.seller_nft_token_account
            );
            require_eq!(
                sell_order.nft_mint,
                ctx.accounts.nft_mint.key(),
                NftMarketPlaceError::InvalidNftMint
            );

            require_eq!(
                sell_order.destination,
                ctx.accounts.seller_destination.key(),
                NftMarketPlaceError::InvalidSellerDestination
            );
            require_eq!(
                sell_order.is_sold,
                false,
                NftMarketPlaceError::SellOrderAlreadySold
            );
            require!(
                sell_order.expires_at > Clock::get()?.unix_timestamp,
                NftMarketPlaceError::SellOrderExpired
            );
            require_eq!(
                sell_order.authority,
                ctx.accounts.seller.key(),
                NftMarketPlaceError::InvalidAuthority
            );

            let (seller_nft_pda, vault_bump) = Pubkey::find_program_address(
                &[
                    NFT_VAULT_SEED.as_bytes(),
                    ctx.accounts.nft_mint.key().as_ref(),
                ],
                ctx.program_id,
            );

            nft_vault_bump = Some(vault_bump);

            require_eq!(
                seller_nft_pda,
                seller_nft_token_account.key(),
                NftMarketPlaceError::InvalidSellerNftTokenAccount
            );

            sell_order.is_sold = true;
            sell_order.price = ctx.accounts.buy_order.price_position;
            sell_order.exit(ctx.program_id)?;

            sell_order_option = Some(sell_order.key());
        }
    } else {
        require_eq!(
            seller_nft_token_account.owner,
            ctx.accounts.seller.key(),
            NftMarketPlaceError::InvalidSellerNftTokenAccount
        );
    }

    let total_cost = ctx
        .accounts
        .buy_order
        .price_position
        .checked_mul(10_000)
        .unwrap();

    //calculate the market fee_basis_points
    let market_fee_poinsts = ctx
        .accounts
        .collection
        .fee_basis_points
        .unwrap_or(ctx.accounts.market.fee_basis_points);

    //calculate the market fee
    let market_fee = ctx
        .accounts
        .buy_order
        .price_position
        .checked_mul(market_fee_poinsts as u64)
        .unwrap();

    //calculate the creator fee
    let mut creators_share: u64 = 0;
    if !ctx.accounts.collection.ignore_creator_fee {
        creators_share = ctx
            .accounts
            .buy_order
            .price_position
            .checked_mul(metadata.seller_fee_basis_points as u64)
            .unwrap();
    }
    //calculate the seller fee
    let seller_fee = total_cost
        .checked_sub(market_fee)
        .unwrap()
        .checked_sub(creators_share)
        .unwrap();

    //transfer the nft
    if let Some(vault_bump) = nft_vault_bump {
        msg!("transfer_nft_from_vault...");
        ctx.accounts
            .transfer_nft_from_vault(seller_nft_token_account.to_account_info(), vault_bump)?;
    } else {
        msg!("transfer_nft...");
        ctx.accounts
            .transfer_nft(seller_nft_token_account.to_account_info())?;
    }

    //transfer the market fee
    msg!("transfer_market_fee...");
    ctx.accounts.transfer_fees(
        ctx.accounts.market_destination.to_account_info(),
        market_fee,
    )?;

    //transfer the seller fee
    msg!("transfer_seller_fee...");
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
    emit!(NftSold {
        buy_order: ctx.accounts.buy_order.key(),
        seller: ctx.accounts.seller.key(),
        sell_order: sell_order_option,
    });

    //close the buy order
    let buy_order = &mut ctx.accounts.buy_order;
    buy_order.is_bought = true;
    Ok(())
}
