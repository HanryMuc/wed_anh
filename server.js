const express = require('express');
const session = require('express-session');
const multer = require('multer');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(session({
    secret: 'bi-mat-sieu-cap-vip-pro',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // Phiên đăng nhập tồn tại trong 1 ngày
}));

const users = [];

// Cấu hình lưu file tự động vào đúng Thư mục con được chọn
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!req.session.user) return cb(new Error('Chưa đăng nhập'));
        
        const folderName = req.query.folder || 'Chưa phân loại';
        const userDir = path.join(__dirname, 'uploads', req.session.user.username, folderName);
        
        if (!fs.existsSync(userDir)){
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// API Đăng ký tài khoản
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Vui lòng điền đủ thông tin!' });
    const userExists = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (userExists) return res.status(400).json({ message: 'Tài khoản đã tồn tại!' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    users.push({ username, password: hashedPassword });
    res.json({ message: 'Đăng ký thành công!' });
});

// API Đăng nhập
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ message: 'Sai tài khoản hoặc mật khẩu!' });
    }
    req.session.user = { username: user.username };
    res.json({ message: 'Đăng nhập thành công!' });
});

// API Đăng xuất
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'Đã đăng xuất' });
});

// API Kiểm tra trạng thái Đăng nhập
app.get('/api/check-auth', (req, res) => {
    if (req.session.user) res.json({ loggedIn: true, username: req.session.user.username });
    else res.json({ loggedIn: false });
});

// 1. API Tạo thư mục mới
app.post('/api/create-folder', (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const { folderName } = req.body;
    if (!folderName) return res.status(400).json({ message: 'Tên thư mục không hợp lệ' });

    const folderPath = path.join(__dirname, 'uploads', req.session.user.username, folderName);
    if (fs.existsSync(folderPath)) {
        return res.status(400).json({ message: 'Thư mục này đã tồn tại!' });
    }

    fs.mkdirSync(folderPath, { recursive: true });
    res.json({ message: 'Tạo thư mục thành công!' });
});

// 2. API Lấy danh sách thư mục hiện tại
app.get('/api/get-folders', (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const userRoot = path.join(__dirname, 'uploads', req.session.user.username);
    
    if (!fs.existsSync(userRoot)) {
        fs.mkdirSync(path.join(userRoot, 'Chưa phân loại'), { recursive: true });
    }

    const folders = fs.readdirSync(userRoot).filter(file => {
        return fs.statSync(path.join(userRoot, file)).isDirectory();
    });
    res.json(folders);
});

// 3. API Tải lên nhiều file một lúc (Tối đa 20 file mỗi lượt)
app.post('/api/upload', upload.array('media', 20), (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Chưa đăng nhập' });
    res.json({ message: 'Tải các tệp lên thành công!' });
});

// 4. API Lấy danh sách tệp theo thư mục
app.get('/api/my-media', (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const folderName = req.query.folder || 'Chưa phân loại';
    const userDir = path.join(__dirname, 'uploads', req.session.user.username, folderName);
    
    if (!fs.existsSync(userDir)) return res.json([]);
    
    const files = fs.readdirSync(userDir).filter(file => {
        return fs.statSync(path.join(userDir, file)).isFile();
    });

    const fileUrls = files.map(file => `/uploads/${req.session.user.username}/${folderName}/${file}`);
    res.json(fileUrls);
});

// 5. API Xóa ảnh khỏi ổ cứng
app.delete('/api/delete-file', (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: 'Chưa đăng nhập' });
    const { filePath } = req.body;

    if (!filePath || !filePath.startsWith(`/uploads/${req.session.user.username}`)) {
        return res.status(403).json({ message: 'Bạn không có quyền xóa tệp này!' });
    }

    const absolutePath = path.join(__dirname, filePath);
    if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        res.json({ message: 'Đã xóa tệp thành công!' });
    } else {
        res.status(404).json({ message: 'Không tìm thấy tệp!' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`));