const {validationResult} = require("express-validator");
const path = require("path");
const fs = require("fs");

const Post = require("../models/post");
const User = require("../models/user");
const io = require("../socket");

exports.getPosts = async (req,res,next) => {
    const currentPage = +req.query.page || 1;
    const perPage = 2;
    let totalItems;
    try {
        const total = await Post.find().countDocuments()
        totalItems = total;
        const posts = await Post.find().populate('creator').sort({createdAt: -1}).skip((currentPage-1)*perPage).limit(perPage);
        res.status(200).json({message: "Post Found", posts: posts, totalItems: totalItems});
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
}

exports.createPost = async (req,res,next) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error("Validation failed, invalid data");
        error.statusCode = 422;
        throw error;
    }
    if(!req.file) {
        const error = new Error("Error uploading file!");
        error.statusCode = 422;
        throw error;
    }
    const title = req.body.title;
    const content = req.body.content;
    const imageUrl = req.file.path;

    const post = new Post({
        title: title,
        content: content,
        imageUrl: imageUrl,
        creator: req.userId,
    });
    try {
        const updatedPost = await post.save();
        const user = await User.findById(req.userId);
        user.posts.push(updatedPost);
        const updatedUser = await user.save();
        io.getIO().emit("posts", {action: "create", post: {...post._doc, creator: {_id: req.userId, name: user.name}}})
        res.status(201).json({
            message: "Post created successfully.",
            post: post,
            creator: {_id: updatedUser._id, name: updatedUser.name}
        });
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
}

module.exports.getPost = async (req,res,next) => {
    const postId = req.params.postId;
    try {
        const post = await Post.findById(postId);
        if(!post) {
            const error = new Error("Cannot find post.");
            error.statusCode= 404;
            throw error;
        }
        res.status(200).json({message: "Post found.",post: post});
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
}

module.exports.updatePost = async (req,res,next) => {
    const errors = validationResult(req);
    try {
        if(!errors.isEmpty()) {
            const error = new Error("Validation failed, invalid data");
            error.statusCode = 422;
            throw error;
        }

        const postId = req.params.postId;
        const title = req.body.title;
        const content = req.body.content;
        let imageUrl = req.body.image;

        if(req.file) {
            imageUrl = req.file.path;
        }
    
        const post = await Post.findById(postId).populate('creator');
        if(!post) {
            const error = new Error("Cannot find post.");
            error.statusCode= 404;
            throw error;
        }
        if(post.creator._id.toString() !== req.userId) {
            const error = new Error("Not authorized.");
            error.statusCode= 403;
            throw error;
        }
        post.title = title;
        post.content = content;
        if(imageUrl) {
            if(imageUrl !== post.imageUrl) clearImage(post.imageUrl);
            post.imageUrl = imageUrl;
        }
        const updatedPost = await post.save();
        io.getIO().emit("posts", {action: "update", post: updatedPost});
        res.status(200).json({message: "Post updated.",post: updatedPost});
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
}

const clearImage = imagePath => {
    filePath = path.join(__dirname,"..",imagePath);
    return fs.unlink(filePath, err => console.log(err));
}

module.exports.deletePost = async (req, res, next) => {
    const postId = req.params.postId;
    try {
        const post = await Post.findById(postId);
        if(!post) {
            const error = new Error("Cannot find post.");
            error.statusCode= 404;
            throw error;
        }
        //Check if user owns this post
        if(post.creator.toString() !== req.userId) {
            const error = new Error("Not authorized.");
            error.statusCode= 403;
            throw error;
        }
        clearImage(post.imageUrl);

        const result = await Post.findByIdAndRemove(postId);
        const user = await User.findById(req.userId);
        user.posts.pull(postId);
        const updatedUser = await user.save();
        io.getIO().emit("posts",{action:"delete",post: postId});
        res.json({"message":"Post deleted", "result": result});
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    } 
   
}