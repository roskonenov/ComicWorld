
import ComicItem from "../../comic-item/ComicItem";
import { useState } from "react";
import styles from "./Section.module.css"
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";

export default function Section({
    comics,
    title,
}) {
    const [current, setCurrent] = useState(0);
    const visibleCount = 4;

    const prevSlide = () => {
        setCurrent((prev) => prev === 0 ? comics.length - visibleCount : prev - 1);
    };

    const nextSlide = () => {
        setCurrent((prev) => prev === comics.length - visibleCount ? 0 : prev + 1);
    };

    const visibleComics = comics.slice(current, current + visibleCount);

    if (visibleComics.length < visibleCount) {
        visibleComics.push(...comics.slice(0, visibleCount - visibleComics.length));
    }
    return (
        <section className={styles['section-container']}>
            <div className={styles['title-container']}>
                <h1 className={styles['section-title']}>{title}</h1>
            </div>
            <div className={styles['carousel-controls']}>
                <button onClick={prevSlide} className={styles['carousel-btn']}><FiArrowLeft /></button>
                <ul className={styles.list}>
                    {visibleComics.map(comic => (
                        <ComicItem key={comic._id} comic={comic} />
                    ))}
                </ul>
                <button onClick={nextSlide} className={styles['carousel-btn']}><FiArrowRight /></button>
            </div>
        </section>
    );
}