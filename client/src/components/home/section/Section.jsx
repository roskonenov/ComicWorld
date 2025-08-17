
import ComicItem from "../../comic-item/ComicItem";
import { useRef, useState, useEffect } from "react";
import styles from "./Section.module.css"
import { FiArrowLeft, FiArrowRight } from "react-icons/fi";

export default function Section({
    comics,
    title,
}) {
    const [current, setCurrent] = useState(0);
    const visibleCount = 4;
    const isTransitioning = useRef(false);

    const extendedComics = comics.concat(comics.slice(0, visibleCount));

    const prevSlide = () => {
        if (isTransitioning.current || current === 0) return;
        setCurrent(prev => prev === 0 ? comics.length : prev - 1);
        isTransitioning.current = true;
    };

    const nextSlide = () => {
        if (isTransitioning.current) return;
        setCurrent(prev => prev + 1);
        isTransitioning.current = true;
    };

    useEffect(() => {
        if (current === comics.length) {
            setCurrent(0);
        }
        const timeout = setTimeout(() => {
            isTransitioning.current = false;
        }, 500);
        return () => clearTimeout(timeout);

    }, [current, comics.length]);

    return (
        <section className={styles['section-container']}>
            <div className={styles['title-container']}>
                <h1 className={styles['section-title']}>{title}</h1>
            </div>
            <div className={styles['carousel-controls']}>
                <button onClick={prevSlide} className={styles['carousel-btn']}><FiArrowLeft /></button>
                <div className={styles.fillment}></div>
                <div className={styles['carousel-window']}>
                    <ul
                        className={styles.list}
                        style={{transform: `translateX(-${current * (10 + 3.75)}vw)`}}>
                        {extendedComics.map((comic) => (
                            <ComicItem key={comic._id} comic={comic} />
                        ))}
                    </ul>
                </div>
                <button onClick={nextSlide} className={styles['carousel-btn']}><FiArrowRight /></button>
            </div>
        </section>
    );
}