import styles from './StarRating.module.css';

export default function StarRating() {
    return (
        <div className={styles['star-container']}>
            <div className={styles['star-container__items']}>
                <input type="radio" name="stars" id="st5" />
                <label htmlFor="st5">
                    <div className={styles['star-stroke']}>
                        <div className={styles['star-fill']}></div>
                    </div>
                    <div className={styles['label-description']} data-content="Excellent"></div>
                </label>
                <input type="radio" name="stars" id="st4" />
                <label htmlFor="st4">
                    <div className={styles['star-stroke']}>
                        <div className={styles['star-fill']}></div>
                    </div>
                    <div className={styles['label-description']} data-content="Good"></div>
                </label>
                <input type="radio" name="stars" id="st3" />
                <label htmlFor="st3">
                    <div className={styles['star-stroke']}>
                        <div className={styles['star-fill']}></div>
                    </div>
                    <div className={styles['label-description']} data-content="OK"></div>
                </label>
                <input type="radio" name="stars" id="st2" />
                <label htmlFor="st2">
                    <div className={styles['star-stroke']}>
                        <div className={styles['star-fill']}></div>
                    </div>
                    <div className={styles['label-description']} data-content="Bad"></div>
                </label>
                <input type="radio" name="stars" id="st1" />
                <label htmlFor="st1">
                    <div className={styles['star-stroke']}>
                        <div className={styles['star-fill']}></div>
                    </div>
                    <div className={styles['label-description']} data-content="Terrible"></div>
                </label>
            </div>
        </div>
    );
}