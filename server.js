import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import multer from "multer";
import GridFsStorage from "multer-gridfs-storage";
import Grid from "gridfs-stream";
import bodyParser from "body-parser";
import path from "path";
import Pusher from "pusher";
import mongoPosts from "./mongoPosts.js";
Grid.mongo = mongoose.mongo;

const app = express();
const port = process.env.PORT || 9000;

const pusher = new Pusher({
  appId: "1101749",
  key: "00b83c508dd4472b6484",
  secret: "aa8aeef33fca7407d1b1",
  cluster: "ap2",
  useTLS: true,
});

app.use(bodyParser.json());
app.use(cors());

const mongoUri =
  "mongodb+srv://admin:admin@cluster0.jsh7a.mongodb.net/fbdb?retryWrites=true&w=majority";

const conn = mongoose.createConnection(mongoUri, {
  useCreateIndex: true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connect(mongoUri, {
  useCreateIndex: true,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

mongoose.connection.once("open", () => {
  console.log("db connected");

  const changeStream = mongoose.connection.collection("posts").watch();
  changeStream.on("change", (change) => {
    console.log(change);
    if (change.operationType === "insert") {
      console.log("Triggering Pusher");
      pusher.trigger("posts", "inserted", {
        change: change,
      });
    } else {
      console.log("err triggering  pusher");
    }
  });
});
//setting up grid fs
let gfs;
conn.once("open", () => {
  console.log("db connected");
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection("images");
});

const storage = new GridFsStorage({
  url: mongoUri,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      const filename = `image-${Date.now()}${path.extname(file.originalname)}`;

      const fileInfo = {
        filename: filename,
        bucketName: "images",
      };

      resolve(fileInfo);
    });
  },
});
const upload = multer({ storage });

app.get("/", (req, res) => res.status(200).send("hello world"));
//sending the image to server
app.post("/upload/image", upload.single("file"), (req, res) => {
  res.json({ file: req.file });
});

app.post("/upload/post", (req, res) => {
  const dbPost = req.body;
  mongoPosts.create(dbPost, (err, data) => {
    if (err) {
      res.status(500).send(err);
    } else {
      res.status(201).send(data);
    }
  });
});

//getting the image from mongodb
app.get("/retrieve/image/single", (req, res) => {
  gfs.files.findOne({ filename: req.query.name }, (err, file) => {
    if (err) {
      res.status(500).send(err);
    } else {
      if (!file || file.length === 0) {
        res.status(400).json({ err: "file not found" });
      } else {
        const readstream = gfs.createReadStream(file.filename);
        readstream.pipe(res);
      }
    }
  });
});

app.get("/retrieve/posts", (req, res) => {
  mongoPosts.find((err, data) => {
    if (err) {
      res.status(500).send(err);
    } else {
      data.sort((b, a) => {
        return a.timestamp - b.timestamp;
      });
      res.status(200).send(data);
    }
  });
});
//
app.listen(port, () => console.log(`listening on localhost:${port}`));
