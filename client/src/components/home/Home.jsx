import Section from "./section/Section";
import homeStyle from "./Home.module.css"

import { useEffect, useState } from "react";
import comicService from "../../services/comicService";


export default function Home() {
    const [comics, setComics] = useState([]);
    
        useEffect(() => {
            comicService.getAllComicInfos()
                .then(setComics);
        }, []);
    
        const latestComics = comics.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
        const discountedComics = comics.filter(comic => comic.oldPrice).slice(0, 5);
        

    return (
        <main className={homeStyle.home}>
            <Section comics={latestComics} title="Latest comics"/>
            <Section comics={discountedComics} title="Hot offers" />
        </main>
    );
}