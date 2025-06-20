const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const app = express();
const port = process.env.PORT || 3000;

// MongoDB连接URI（需要在Vercel中设置环境变量）
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let notesCollection;

// 连接到MongoDB
async function connectDB() {
  try {
    await client.connect();
    const database = client.db('note-app');
    notesCollection = database.collection('notes');
    console.log('成功连接到MongoDB');
  } catch (error) {
    console.error('MongoDB连接错误:', error);
  }
}

connectDB();

// 中间件
app.use(express.json());
app.use(cors({
  origin: 'https://note.yunlinsan.ren',
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type']
}));

// 保存笔记API
app.post('/api/notes', async (req, res) => {
  try {
    const { content } = req.body;
    const timestamp = new Date();
    
    // 我们使用单一文档来存储所有内容
    const result = await notesCollection.updateOne(
      { id: 'main-note' },
      { 
        $set: { 
          content,
          lastUpdated: timestamp
        }
      },
      { upsert: true }
    );
    
    res.status(200).json({ message: '笔记已保存', timestamp });
  } catch (error) {
    console.error('保存笔记错误:', error);
    res.status(500).json({ message: '保存笔记时出错' });
  }
});

// 获取笔记API
app.get('/api/notes', async (req, res) => {
  try {
    const note = await notesCollection.findOne({ id: 'main-note' });
    if (note) {
      res.status(200).json(note);
    } else {
      res.status(200).json({ content: '', lastUpdated: null });
    }
  } catch (error) {
    console.error('获取笔记错误:', error);
    res.status(500).json({ message: '获取笔记时出错' });
  }
});

app.listen(port, () => {
  console.log(`服务器运行在端口 ${port}`);
});

module.exports = app;