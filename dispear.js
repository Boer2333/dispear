import { ethers } from 'ethers';
import { promises as fs } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const ABI = [
    "function disperseEther(address[] recipients, uint256[] values)"
];

class EtherDisperser {
    constructor() {
        // 修正这一行
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(process.env.DISPERSE_CONTRACT, ABI, this.wallet);
        this.BATCH_SIZE = 900;//单批最大分发数量900
        this.AMOUNT_PER_ADDRESS = "0.00000065"; // 设置每个地址分发的金额，单位ETH
    }

    async loadAddresses() {
        try {
            const content = await fs.readFile('add.txt', 'utf8');
            return content.split('\n')
                .map(line => line.trim())
                .filter(address => address && ethers.isAddress(address)); // 修改这里
        } catch (error) {
            console.error('读取地址文件时出错:', error);
            throw error;
        }
    }

    async estimateGas(recipients, values) {
        try {
            const gasEstimate = await this.contract.disperseEther.estimateGas(
                recipients, 
                values, 
                {
                    value: values.reduce((a, b) => a + b)
                }
            );
            return gasEstimate * 12n / 10n; // 修改这里
        } catch (error) {
            console.error('估算gas费用时出错:', error);
            throw error;
        }
    }

    async processBatch(addresses, batchIndex) {
        const values = addresses.map(() => 
            ethers.parseEther(this.AMOUNT_PER_ADDRESS)
        );
        
        const totalValue = values.reduce((a, b) => a + b);
        
        console.log(`\n处理第 ${batchIndex + 1} 批数据`);
        console.log(`本批地址数量: ${addresses.length}`);
        console.log(`本批发送总额: ${ethers.formatEther(totalValue)} ETH`);

        try {
            // 获取当前gas价格
            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            console.log(`当前gas价格: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

            // 估算gas
            const gasEstimate = await this.estimateGas(addresses, values);
            console.log(`预估gas用量: ${gasEstimate.toString()}`);

            // 计算交易费
            const txFee = gasPrice * gasEstimate;
            console.log(`预估交易费用: ${ethers.formatEther(txFee)} ETH`);

            // 发送交易
            const tx = await this.contract.disperseEther(
                addresses, 
                values, 
                {
                    value: totalValue,
                    gasLimit: gasEstimate,
                    gasPrice: gasPrice
                }
            );

            console.log(`交易已发送，交易哈希: ${tx.hash}`);
            
            // 等待交易确认
            const receipt = await tx.wait();
            console.log(`交易已确认，区块高度: ${receipt.blockNumber}`);
            
            // 保存交易记录
            await this.saveTransactionRecord(batchIndex, addresses, tx.hash, receipt);

            return true;
        } catch (error) {
            console.error('处理批次时出错:', error);
            await this.saveErrorLog(batchIndex, addresses, error);
            return false;
        }
    }

    async saveTransactionRecord(batchIndex, addresses, txHash, receipt) {
        const record = {
            时间戳: new Date().toLocaleString('zh-CN'),
            批次序号: batchIndex + 1,
            地址数量: addresses.length,
            交易哈希: txHash,
            区块高度: receipt.blockNumber,
            gas消耗: receipt.gasUsed.toString(),
            地址列表: addresses
        };

        await fs.appendFile(
            '交易记录.json', 
            JSON.stringify(record, null, 2) + ',\n'
        );
    }

    async saveErrorLog(batchIndex, addresses, error) {
        const errorRecord = {
            时间戳: new Date().toLocaleString('zh-CN'),
            批次序号: batchIndex + 1,
            地址列表: addresses,
            错误信息: error.message
        };

        await fs.appendFile(
            '错误日志.json', 
            JSON.stringify(errorRecord, null, 2) + ',\n'
        );
    }

    async start() {
        try {
            const addresses = await this.loadAddresses();
            console.log(`已加载 ${addresses.length} 个地址`);

            // 检查钱包余额
            const balance = await this.provider.getBalance(this.wallet.address);
            const totalRequired = ethers.parseEther(this.AMOUNT_PER_ADDRESS) * BigInt(addresses.length);

            if (balance < totalRequired) {
                throw new Error(`余额不足。当前余额: ${ethers.formatEther(balance)} ETH, 需要: ${ethers.formatEther(totalRequired)} ETH`);
            }

            // 分批处理
            for (let i = 0; i < addresses.length; i += this.BATCH_SIZE) {
                const batch = addresses.slice(i, i + this.BATCH_SIZE);
                const success = await this.processBatch(batch, Math.floor(i / this.BATCH_SIZE));
                
                if (!success) {
                    console.log('批次处理失败，暂停1分钟后重试...');
                    await new Promise(resolve => setTimeout(resolve, 60000));
                } else {
                    // 成功后等待10秒再处理下一批
                    console.log('等待5秒后处理下一批...');
                    await new Promise(resolve => setTimeout(resolve, 50000));
                }
            }

            console.log('所有批次处理完成');
        } catch (error) {
            console.error('分发过程出错:', error);
        }
    }
}

// 运行脚本
const disperser = new EtherDisperser();
disperser.start().catch(console.error);