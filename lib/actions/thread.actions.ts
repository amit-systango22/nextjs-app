"use server";

import { revalidatePath } from "next/cache";

import { connectToDB } from "../mongoose";

import User from "../models/user.model";
import Thread from "../models/thread.model";

interface Params {
  text: string;
  author: string;
  path: string;
}

export async function createThread({
  text,
  author,
  path,
}: Params) {
  try {
    connectToDB();
    const createdThread = await Thread.create({
      text,
      author,
    });

    // Update user model
    await User.findByIdAndUpdate(author, {
      $push: { threads: createdThread._id },
    });
    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Error creating thread: ${error.message}`);
  }
}

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDB();

  // Calculate the number of posts to skip
  const skipAmount = (pageNumber - 1) * pageSize;

  // fetch the posts that have no parents(top-level threads..)
  const postQuery = Thread.find({ parentId: { $in: [null, undefined] } })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: "author", model: User })
    .populate({
      path: "children",
      populate: {
        path: "author",
        model: User,
        select: "_id name parentId image",
      },
    });

  const totalPostsCount = await Thread.countDocuments({
    parentId: { $in: [null, undefined] },
  });
  const posts = await postQuery.exec();

  const isNext = totalPostsCount > skipAmount + posts.length;

  return { posts, isNext };
}


export async function fetchThreadById(id: string){
  connectToDB();
  try{
    const thread = await Thread.findById(id)
    .populate({
      path: "author",
      model: User,
      select: "_id id name image"
    })
    .populate({
      path: 'children',
      populate: [
        {
          path: 'author',
          model: User,
          select: "_id id name parentId image"
        },
        {
          path: 'children',
          model: Thread,
          populate: {
            path: 'author',
            model: User,
            select: "_id id name parentId image"
          }
        }
      ]
    }).exec();
    return thread;
  }catch(error: any) {
    throw new Error(`Error while fetching thread ${error.message}`)
  }
}


export async function addCommentToThread(
  threadId: string,
  commentText: string,
  userId: string,
  path: string,
){
  connectToDB();

  try{
    // find the original thread by its ID
    const originalThread = await Thread.findById(threadId);
    if(!originalThread) {
      throw new Error('Thread not found')
    }

    // create a new thread with the comment text
    const commentThread = new Thread({
      text: commentText,
      author: userId,
      parentId: threadId
    })

    // Save the new thread
    const savedCommentThread = await commentThread.save();

    // Update the original thread to include the new comment
    originalThread.children.push(savedCommentThread._id);

    // Save the original thread
     await originalThread.save();

     revalidatePath(path)
  }catch(error: any) {
    throw new Error(`Error adding comment to thread ${error.message}`)
  }
}