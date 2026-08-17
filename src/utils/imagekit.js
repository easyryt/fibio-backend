import ImageKit from "imagekit";
import { config } from "../config/config.js";

const imagekit = new ImageKit({
  publicKey: config.imagekit.publicKey,
  privateKey: config.imagekit.privateKey,
  urlEndpoint: config.imagekit.urlEndpoint,
});

export default imagekit;
