import express from 'express';
import cors from 'cors';
import routes from './routes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Disable Caching
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.use('/api', routes);

const PORT = 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
