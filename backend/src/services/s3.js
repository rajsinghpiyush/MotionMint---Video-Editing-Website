import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "mock-key",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "mock-secret",
  },
});

export const uploadToS3 = async (filePath, filename) => {
  if (process.env.AWS_ACCESS_KEY_ID === "mock-key" || !process.env.AWS_ACCESS_KEY_ID) {
    console.warn("Using mock S3 upload because AWS credentials are not set.");
    return `http://localhost:3001/uploads/${filename}`;
  }

  const bucketName = process.env.AWS_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("AWS_BUCKET_NAME is not defined in .env");
  }

  const fileStream = fs.createReadStream(filePath);
  
  const uploadParams = {
    Bucket: bucketName,
    Key: `processed-videos/${filename}`,
    Body: fileStream,
    ContentType: "video/mp4",
  };

  try {
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command);
    
    return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/processed-videos/${filename}`;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw error;
  }
};
