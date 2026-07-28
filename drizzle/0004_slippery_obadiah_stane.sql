ALTER TABLE `import_batch` ADD `resultCurrencies` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batch` ADD `resultCurrencySource` text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE `trade` ADD `resultCurrency` text;--> statement-breakpoint
ALTER TABLE `trade` ADD `resultCurrencySource` text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
UPDATE `trade`
SET
  `resultCurrency` = (
    SELECT upper(trim(`trading_account`.`currency`))
    FROM `trading_account`
    WHERE `trading_account`.`id` = `trade`.`tradingAccountId`
  ),
  `resultCurrencySource` = 'ACCOUNT'
WHERE
  (`resultCurrency` IS NULL OR trim(`resultCurrency`) = '')
  AND EXISTS (
    SELECT 1
    FROM `trading_account`
    WHERE
      `trading_account`.`id` = `trade`.`tradingAccountId`
      AND trim(`trading_account`.`currency`) <> ''
  );--> statement-breakpoint
UPDATE `import_batch`
SET
  `resultCurrencies` = '["' || upper(trim(`accountCurrency`)) || '"]',
  `resultCurrencySource` = 'ACCOUNT'
WHERE
  (`resultCurrencies` = '[]' OR `resultCurrencies` IS NULL)
  AND `accountCurrency` IS NOT NULL
  AND trim(`accountCurrency`) <> '';
