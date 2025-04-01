import { createContext, useContext } from "react";

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
    _createdOn: 0,
    buyComicHandler: () => null,

});

export function UseComicContext() {
    return useContext(ComicContext);
}