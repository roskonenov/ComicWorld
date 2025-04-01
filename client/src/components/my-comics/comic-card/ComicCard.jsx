import styles from './ComicCard.module.css'

export default function ComicCard({
    coverUrl,
    title,
    slogan,
}) {
    return (
        <article className={styles['comic-card']}>
            <div className={styles['comic-cover']}>
                <img src={coverUrl} alt={`${title} cover`} />
            </div>
            <div className={styles['comic-info']}>
                <h3 className={styles['comic-title']}>{title}</h3>
                <p className={styles['comic-slogan']}>{slogan}</p>
                <button className={styles['read-btn']}>Read</button>
            </div>
        </article>
    );
}