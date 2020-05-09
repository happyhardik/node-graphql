const bcrypt = require("bcryptjs");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const User = require("../models/user");
const Post = require("../models/post");

module.exports = {
    createUser: async function (args, req) {
        const email = args.userInput.email;
        const errors = [];
        if(!validator.isEmail(args.userInput.email)) {
            errors.push("Email is invalid");
        }
        if(validator.isEmpty(args.userInput.password) || !validator.isLength(args.userInput.password,{min:5})) {
            errors.push("Invalid password, it has to be minimum 5 characters long.");
        }
        if(errors.length > 0) {
            const error = new Error("Invalid input.");
            error.data = errors;
            error.code = 422;
            throw error;
        }
        const existingUser = await User.findOne({email: email});
        if(existingUser) {
            throw new Error("User already exists");
        }
        const hashedPass = await bcrypt.hash(args.userInput.password, 12);
        const user = new User({
            email: args.userInput.email,
            name: args.userInput.name,
            password: hashedPass
        })
        const savedUser = await user.save();
        return {...savedUser._doc, _id: savedUser._id.toString()};
    },

    login: async function({email, password}, req) {
        const user = await User.findOne({email: email});
        if(!user) {
            const error = new Error("User not found");
            error.code = 401;
            throw error;
        }
        const isEqual = await bcrypt.compare(password, user.password);
        if(!isEqual) {
            const error = new Error("Invalid password");
            error.code = 401;
            throw error;
        }
        const token = jwt.sign({email: email, userId: user._id}, process.env.salt, {expiresIn:'1h'});
        return {token: token, userId: user._id.toString()};
    },

    createPost: async function({postInput}, req) {
        if(!req.isAuth) {
            const error = new Error("Not authenticated");
            error.code = 401;
            throw error;
        }
        const errors = [];
        if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title,{min:5})) {
            errors.push("Invalid title, it needs to be 5 characters long.");
        }
        if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content,{min:5})) {
            errors.push("Invalid content, it needs to be 5 characters long.");
        }
        if(errors.length > 0) {
            const error = new Error("Invalid input.");
            error.data = errors;
            error.code = 422;
            throw error;
        }
        const user = await User.findById(req.userId);
        if(!user) {
            const error = new Error("Error finding user.");
            error.code = 401;
            throw error;
        }
        const post = new Post({
            title: postInput.title,
            content: postInput.content,
            imageUrl: postInput.imageUrl,
            creator: user
        });
        const createdPost = await post.save();
        user.posts.push(createdPost);
        const updatedUser = await user.save();
        return {...createdPost._doc, _id: createdPost._id.toString(), createdAt: createdPost.createdAt.toISOString(),updatedAt: createdPost.updatedAt.toISOString()}
    },

    getPosts: async function({page}, req) {
        if(!req.isAuth) {
            const error = new Error("Not authenticated");
            error.code = 401;
            throw error;
        }
        if(!page) page=1;
        const perPage = 2;
        const totalPosts = await Post.find().countDocuments();
        const posts = await Post.find().skip((page-1)*perPage).limit(perPage).sort({createdAt: -1}).populate('creator');
        const updatedPosts = posts.map(p => {
            return {...p._doc, _id: p._id.toString(), createdAt: p.createdAt.toISOString(),updatedAt: p.updatedAt.toISOString()}
        })
        return {posts: updatedPosts, totalPosts: totalPosts};
    },

    post: async function({postId}, req) {
        if(!req.isAuth) {
            const error = new Error("Not authenticated");
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(postId).populate('creator');
        if(!post) {
            const error = new Error("No post ID found");
            error.code = 404;
            throw error;
        }
        return {...post._doc, _id: post._id.toString(), createdAt: post.createdAt.toISOString(),updatedAt: post.updatedAt.toISOString()}
    },

    updatePost: async function({id, postInput}, req) {
        if(!req.isAuth) {
            const error = new Error("Not authenticated");
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if(!post) {
            const error = new Error("No post ID found");
            error.code = 404;
            throw error;
        }
        if(post.creator._id.toString() !== req.userId.toString()) {
            const error = new Error("Unauthorized");
            error.code = 403;
            throw error;
        }
        const errors = [];
        if(validator.isEmpty(postInput.title) || !validator.isLength(postInput.title,{min:5})) {
            errors.push("Invalid title, it needs to be 5 characters long.");
        }
        if(validator.isEmpty(postInput.content) || !validator.isLength(postInput.content,{min:5})) {
            errors.push("Invalid content, it needs to be 5 characters long.");
        }
        if(errors.length > 0) {
            const error = new Error("Invalid input.");
            error.data = errors;
            error.code = 422;
            throw error;
        }
        post.title= postInput.title;
        post.content= postInput.content;
        if(postInput.imageUrl !== 'undefined' && postInput.imageUrl) {
            post.imageUrl= postInput.imageUrl;
        }
        const updatedPost = await post.save();
        
        return {...updatedPost._doc, _id: updatedPost._id.toString(), createdAt: updatedPost.createdAt.toISOString(),updatedAt: updatedPost.updatedAt.toISOString()};
    },

    deletePost: async function({id}, req) {
        if(!req.isAuth) {
            const error = new Error("Not authenticated");
            error.code = 401;
            throw error;
        }
        const post = await Post.findById(id).populate('creator');
        if(!post) {
            const error = new Error("No post ID found");
            error.code = 404;
            throw error;
        }
        filePath = path.join(__dirname,"..",post.imageUrl);
        await fs.unlink(filePath, err => console.log(err));
        const user = await User.findById(post.creator._id);
        user.posts.pull(id);
        await user.save();
        const result = await Post.findByIdAndRemove(id);
        return id;
    },

    status: async function({}, req) {
        if(!req.isAuth) {
            const error = new Error("Not authenticated");
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        return user.status;
    },

    setStatus: async function({status}, req) {
        if(!req.isAuth) {
            const error = new Error("Not authenticated");
            error.code = 401;
            throw error;
        }
        const user = await User.findById(req.userId);
        user.status = status;
        await user.save();
        return true;
    }
}