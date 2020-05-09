const {validationResult} = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/user");

exports.signup = async (req, res, next) => {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        const error = new Error("Validation failed");
        error.statusCode = 422;
        error.data = errors.array();
        throw error;
    }
    const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    try {
        const hash = await bcrypt.hash(password,12)
    
        const user = new User({
            email: email,
            name: name,
            password: hash
        });
        const updatedUser = await user.save();
        
        res.status(201).json({message: "User created!", userId: updatedUser._id})
    
    } 
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
} 

exports.postLogin = async (req, res, next) => {
    const email = req.body.email;
    const password = req.body.password;

    try {
        const user = await User.findOne({email: email});
        if(!user) {
            const error = new Error("Cannot find user with that email.");
            error.statusCode= 422;
            throw error;
        }
        const isEqual = await bcrypt.compare(password,user.password);
        if(!isEqual) {
            const error = new Error("Invalid details.");
            error.statusCode= 401;
            throw error;
        }
        const token = jwt.sign({
            email: user.email,
            userId: user._id.toString()
        }, process.env.salt, {expiresIn:'1h'});
        res.status(200).json({token: token, userId: user._id.toString()});
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
}

exports.getStatus = async (req,res,next) => {
    const userId = req.userId;
    try {
        const user = await User.findById(userId);
        res.status(200).json({status: user.status})
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
}
exports.postStatus = async (req,res,next) => {
    const userId = req.userId;
    console.log(req);
    try {
        const user = await User.findById(userId);
        user.status = req.body.status;
        const updatedUser = await user.save();
        res.status(200).json({message: "Status updated", status: updatedUser.status})
    }
    catch(err) {
        if(!err.statusCode) err.statusCode=500;
        next(err);
    }
}