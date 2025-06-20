// 使用内存存储笔记内容
let noteContent = '';

export default async function handler(req, res) {
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
        res.status(200).json({ content: noteContent });
    } else if (req.method === 'POST') {
        // 更新笔记内容
        const { content } = req.body;
        if (typeof content === 'string') {
            noteContent = content;
            res.status(200).json({ success: true });
        } else {
            res.status(400).json({ error: 'Invalid content' });
        }
    } else {
        res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}