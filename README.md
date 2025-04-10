# dispear
EVM分发工具，几乎没有额外收费，比OK快，比CT省钱，mct是大爹但好像也有小笔手续费。

add.txt放入要分发的地址

dispear.js  17-18行修改单批分发数量和金额。暂时使用传统gas方法，后面做优化区分传统gas链和1151方法的链

创建文本-

RPC_URL=   #填入分发链的RPC，大部分EVM链都是这个合约地址，小额实验先
PRIVATE_KEY=  #用于分发的钱包私钥
DISPERSE_CONTRACT=0xD152f549545093347A162Dce210e7293f1452150

文件保存后重命名为.env
