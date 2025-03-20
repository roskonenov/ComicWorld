import styles from "./Star.module.css";

export default function Star({
    starValue,
    ratingHandler,
    selectedRating
}) {
    

    const values = {
        1: "Terrible",
        2: "Bad",
        3: "OK",
        4: "Good",
        5: "Excellent",
    };

    

    return (
        <>
            <input 
            className={styles.star} 
            type="radio" 
            name="stars" 
            id={`st${starValue}`} 
            checked={selectedRating === starValue}
            onChange={() => ratingHandler(starValue)}
            />
            <label className={styles['star-label']} htmlFor={`st${starValue}`}>
                <div className={styles['star-stroke']}>
                    <div className={styles['star-fill']}></div>
                </div>
                <div className={styles['label-description']} data-content={values[starValue]}></div>
            </label>
        </>
    );
}