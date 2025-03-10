import { useEffect, useState } from "react";
import ComicItem from "./comic-item/ComicItem";

import styles from "./Section.module.css"
import comicService from "../../../services/comicService";

export default function Section() {
    const [comics, setComics] = useState([]);

    useEffect(() => {
        comicService.getAllComicInfos()
            .then(setComics);
    }, []);
  
    return (
        <section className={styles['section-container']}>
            <div className={styles['title-container']}>
                <h1 className={styles['section-title']}>Newest comics</h1>
            </div>
            <div className={styles['list-container']}>
                <ul className={styles.list}>
                    {comics.map(comic => <ComicItem key={comic._id} {...comic}/>)}
                </ul>
            </div>
        </section>
    );
}