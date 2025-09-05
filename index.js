import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://komiku.org';
const app = express();

app.set('trust proxy', true);

//helpers
const axiosInstance = axios.create({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
});

const fetchHtml = async (url) => {
    const { data, status } = await axiosInstance.get(url);
    return status === 200 ? cheerio.load(data) : null;
};

const buildAbsoluteUrl = (req, path) => `${req.protocol}://${req.get('host')}${path}`;

const cleanImgUrl = (src) => src?.split('?')[0] || '';

//scrapers
const scrapeArticleList = ($, container, req) =>
    $(container).children('article').map((i, e) => ({
        rank: i + 1,
        title: $(e).find('.ls2j > h3 > a').text().trim(),
        description: $(e).find('.ls2j > span').text().trim(),
        chapter: Number($(e).find('.ls2j > a').text().trim().split(' ')[1]),
        chapter_url: buildAbsoluteUrl(req, $(e).find('.ls2j > a').attr('href')),
        thumbnail: cleanImgUrl($(e).find('.ls2v > a > img').attr('data-src')),
        thumbnail_alt: $(e).find('.ls2v > a > img').attr('alt'),
        url: buildAbsoluteUrl(req, $(e).find('.ls2v > a').attr('href')),
    })).toArray();

const scrapeNewComics = ($, req) =>
    $('#Terbaru .ls4w').children('article').map((_, e) => ({
        title: $(e).find('.ls4j > h3 > a').text().trim(),
        description: $(e).find('.ls4j > span').text().trim(),
        up: Number($(e).find('.ls4v > .up').text().split(' ')[1]),
        warna: Boolean($(e).find('.ls4v > .warna').length),
        chapter: Number($(e).find('.ls4j > a').text().trim().split(' ')[1]),
        chapter_url: buildAbsoluteUrl(req, $(e).find('.ls4j > a').attr('href')),
        thumbnail: cleanImgUrl($(e).find('.ls4v > a > img').attr('data-src')),
        thumbnail_alt: $(e).find('.ls4v > a > img').attr('alt'),
        url: buildAbsoluteUrl(req, $(e).find('.ls4v > a').attr('href')),
    })).toArray();

const scrapeComicList = ($, req) => {
    const result = {};
    let currKey = null;

    $('#Berita #history').children('div').each((_, e) => {
        if ($(e).is('.prt')) {
            currKey = $(e).find('h2').text().trim();
            result[currKey] = [];
        } else if ($(e).is('.ls4')) {
            result[currKey].push({
                title: $(e).find('.ls4j > h4 > a').text().trim(),
                description: $(e).find('.ls4j > span').eq(0).text().trim(),
                status: $(e).find('.ls4j > span').eq(1).text().trim().split(':')[1].trim(),
                genre: $(e).find('.ls4j > span').eq(2).text().trim().split(':')[1].trim().split(','),
                thumbnail: cleanImgUrl($(e).find('.ls4v > a > img').attr('data-src')),
                thumbnail_alt: $(e).find('.ls4v > a > img').attr('alt'),
                url: buildAbsoluteUrl(req, $(e).find('.ls4v > a').attr('href')),
            });
        }
    });

    return result;
};

const scrapeComicDetails = ($, req) => ({
    title: $('#Informasi > .inftable tr:first > td:first').next().text().trim(),
    title_id: $('#Informasi > .inftable tr:eq(1) > td:first').next().text().trim(),
    type: $('#Informasi > .inftable tr:eq(2) > td:first').next().text().trim(),
    author: $('#Informasi > .inftable tr:eq(4) > td:first').next().text().trim(),
    story_concept: $('#Informasi > .inftable tr:eq(3) > td:first').next().text().trim(),
    status: $('#Informasi > .inftable tr:eq(5) > td:first').next().text().trim(),
    rating: $('#Informasi > .inftable tr:eq(6) > td:first').next().text().trim(),
    genres: $('#Informasi > .genre .genre')
        .map((_, e) => $(e).find('a > span').text())
        .toArray(),
    thumbnail: cleanImgUrl($('#Informasi > .ims img').attr('src')),
    thumbnail_alt: $('#Informasi > .ims img').attr('alt'),
    description: $('#Review p').text().trim(),
    synopsis: $('#Sinopsis p').text().trim(),
    cover_img: ($('head > style').text().match(/url\(['']?(https?:\/\/[^'')]+?\.jpg)/i) || [])[1] || '',
    chapters: $('#Chapter #Daftar_Chapter #daftarChapter > tr:first')
        .nextAll()
        .map((_, e) => ({
            title: $(e).find('td').first().find('a span').text().trim(),
            url: buildAbsoluteUrl(req, $(e).find('td').first().find('a').attr('href')),
            upload_date: $(e).find('td').last().text().trim(),
        }))
        .toArray(),
    more_like: $('#Spoiler > .grd')
        .map((_, e) => ({
            title: $(e).find('a > .h4').text().trim(),
            description: $(e).find('p').text().trim(),
            type: $(e).find('a .tpe1_inf > b').text().trim(),
            story_concept: $(e).find('a .tpe1_inf').text().trim().split(' ')[1],
            url: buildAbsoluteUrl(req, $(e).find('a').attr('href')),
            thumbnail: cleanImgUrl($(e).find('a img').attr('data-src')),
            thumbnail_alt: $(e).find('a > .h4').text().trim(),
        }))
        .toArray(),
});

const scrapeChapter = ($) => ({
    info: $('#Judul > .tbl tr:first td:last').text().trim(),
    img: $('#Baca_Komik img.ww').map((_, e) => ({
        id: $(e).attr('id'),
        src: $(e).attr('src'),
        alt: $(e).attr('alt')
    })).toArray()
});

//home route
app.get('/', async (req, res) => {
    try {
        const $ = await fetchHtml(BASE_URL);
        if (!$) return res.json({});
        res.json({
            recommend: scrapeArticleList($, '#Rekomendasi_Komik .ls12', req),
            hot_manga: scrapeArticleList($, '#Komik_Hot_Manga .ls12', req),
            hot_manhwa: scrapeArticleList($, '#Komik_Hot_Manhwa .ls12', req),
            hot_manhua: scrapeArticleList($, '#Komik_Hot_Manhua .ls12', req),
            new_comics: scrapeNewComics($, req),
        });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

//manga list
app.get('/manga', async (req, res) => {
    try {
        const $ = await fetchHtml(`${BASE_URL}/daftar-komik/?tipe=manga`);
        if (!$) return res.json({});
        res.json(scrapeComicList($, req));
    } catch (err) {
        res.status(500).send(err.message);
    }
});

//manhwa list
app.get('/manhwa', async (req, res) => {
    try {
        const $ = await fetchHtml(`${BASE_URL}/daftar-komik/?tipe=manhwa`);
        if (!$) return res.json({});
        res.json(scrapeComicList($, req));
    } catch (err) {
        res.status(500).send(err.message);
    }
});

//manhua list
app.get('/manhua', async (req, res) => {
    try {
        const $ = await fetchHtml(`${BASE_URL}/daftar-komik/?tipe=manhua`);
        if (!$) return res.json({});
        res.json(scrapeComicList($, req));
    } catch (err) {
        res.status(500).send(err.message);
    }
});

//manga detail (include manhwa and manhua)
app.get('/manga/:slug', async (req, res) => {
    try {
        const $ = await fetchHtml(`${BASE_URL}/manga/${req.params.slug}`);
        if (!$) return res.json({});
        res.json(scrapeComicDetails($, req));
    } catch (err) {
        res.status(500).send(err.message);
    }
});

//chapter
app.get('/:slug', async (req, res) => {
    try {
        const $ = await fetchHtml(`${BASE_URL}/${req.params.slug}`);
        if (!$) return res.json({});
        res.json(scrapeChapter($));
    } catch (err) {
        res.status(500).send(err.message);
    }
});

app.listen(3000, () => console.log('App listening on port 3000'));

