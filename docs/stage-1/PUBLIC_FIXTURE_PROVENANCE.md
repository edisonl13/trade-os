# Stage 1 公开测试夹具来源

更新日期：2026-07-28

这些文件只用于验证导入格式、字段边界和安全拒绝逻辑。它们不是产品用户数据，也不能证明 TRADE//OS 已经通过真实用户账户验收。

## Hyperliquid 成交历史摘录

项目文件：

`tests/fixtures/public/hyperliquid-execution-history-excerpt.csv`

来源：

- 数据集：Historical Trader Data
- 发布页：https://www.kaggle.com/datasets/shambhosatishnangsre/historical-trader-data
- 公开镜像：https://github.com/rohankharche34/crypto-pulse/blob/main/data_raw/historical_data.csv
- 镜像检查提交：`cc45d8adb09cb46d2ffe490cdaa9293a607c2ddc`
- 数据集许可证：CC BY-SA 4.0

处理：

- 仅保留 10 条能够展示分批开仓与分批平仓结构的记录。
- 删除公开钱包地址。
- 将交易哈希替换为 `REDACTED`。
- 将 Trade ID 替换为仅用于测试的稳定编号。
- 保留价格、数量、时间、Closed PnL、Fee 和订单分组关系。

限制：

- 每行是 execution/fill，不是一笔完整已平仓交易。
- 同一订单会出现多次部分成交。
- 导入器必须先进行仓位/成交配对；在该能力完成前必须拒绝直接保存。

## MetaTrader 4 策略报告摘录

项目文件：

- `tests/fixtures/public/mt4-strategy-report-excerpt.csv`
- `tests/fixtures/public/mt4-strategy-report-excerpt.htm`

来源：

- 仓库：https://github.com/jjeg1979/AlgoTrader
- 原始文件：https://github.com/jjeg1979/AlgoTrader/blob/58a2a7b6557a695b2655bfad1c58638aa5e75b08/tests/payload/backtests/USDCAD_D1_C001_set0.htm
- 检查提交：`58a2a7b6557a695b2655bfad1c58638aa5e75b08`
- 仓库许可证：MIT

处理：

- 从公开 MT4 HTML 策略测试报告的 Closed Transactions 表提取前 10 笔交易，分别保留为脱敏 HTML 与等价 CSV。
- 未包含账户姓名、账户号码或券商个人资料。
- 保留 Ticket、开平仓时间、价格、方向、手数、Commission、Swap 和 Profit。

限制：

- 这是策略测试报告，不是真实入金账户。
- 原报告没有明确声明交易服务器时区，因此时间口径仍不可视为已确认。
- 脱敏 HTML 已用于验证 MT4 原生报告解析入口；完整公开报告也已做只读解析验证。
