
import Spinner from "../../spinner/Spinner";
import ComicItem from "./comic-item/ComicItem";

import styles from "./Section.module.css"

export default function Section({
    comics,
    title,
    loading,
}) {
    return (
        <section className={styles['section-container']}>
            <div className={styles['title-container']}>
                <h1 className={styles['section-title']}>{title}</h1>
            </div>
            <div className={styles['list-container']}>
                <ul className={styles.list}>
                    {comics.map(comic =>
                        loading
                            ? <Spinner />
                            : <ComicItem key={comic._id} {...comic} />)}
                </ul>
            </div>
        </section>
    );
}