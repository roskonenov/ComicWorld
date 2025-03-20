import { createContext } from "react";

export const ComicContext = createContext({

    _ownerId: "",
    coverUrl: "",
    title: "",
    slogan: "",
    currentPrice: "",
    oldPrice: "",
    createdAt: "",
    rating: {
        value: 0,
        votes: 0
    },
    _id: "",
    _createdOn: 0

});