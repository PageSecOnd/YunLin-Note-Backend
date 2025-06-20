// 使用内存存储笔记内容
let noteContent = '';

module.exports = async (req, res) => {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', 'https://note.yunlinsan.ren');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method === 'GET') {
        // 获取笔记内容
        return res.status(200).json({ content: noteContent });
    } 
    
    if (req.method === 'POST') {
        // 更新笔记内容
        try {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });
            
            req.on('end', () => {
                const { content } = JSON.parse(body);
                if (typeof content === 'string') {
                    noteContent = content;
                    return res.status(200).json({ success: true });
                } else {
                    return res.status(400).json({ error: 'Invalid content' });
                }
            });
        } catch (error) {
            return res.status(500).json({ error: 'Internal server error' });
        }
    } 
    
    return res.status(405).end(`Method ${req.method} Not Allowed`);
};