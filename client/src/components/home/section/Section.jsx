import ComicItem from "./comic-item/ComicItem";

import styles from "./Section.module.css"

export default function Section() {
    return (
        <section className={styles['section-container']}>
            <div className={styles['title-container']}>
                <h1 className={styles['section-title']}>Newest comics</h1>
            </div>
            <div className={styles['list-container']}>
                <ul className={styles.list}>
                    <ComicItem/>
                </ul>
            </div>
        </section>
    );
}