import styles from "./ComicItem.module.css"

export default function ComicItem() {
    return (
        <li className={styles['item-container']}>
            <div className={styles['main-container']}>
                <div className={styles['cover-container']}>
                    <a href="#"><img src="/media/Aliens - More than Human-000.jpg" className={styles.cover} /></a>
                </div>
                <div className={styles['price-container']}>
                    <div className={styles['price-content']}>
                        <h4 className={styles['comic-title']}>Aliens</h4>
                        <p className={styles['comic-slogan']}>
                            More than Human
                        </p>
                        <p className={styles['current-price']}>$28.00</p>
                        <p className={styles['old-price']}>$44.99</p>
                        <button className={styles['buy-btn']}>Buy now</button>
                    </div>
                </div>
            </div>
        </li>
    );
}