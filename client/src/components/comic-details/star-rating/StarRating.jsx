import Star from './star/Star';
import styles from './StarRating.module.css';

import { useState, useEffect } from "react";


export default function StarRating({
    value: rating,
    votes,
    comicId,
}) {
    const [selectedRating, setSelectedRating] = useState(null);
    const [averageRating, setAverageRating] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [votedComicsList, setVotedComicsList] = useState([]);

    useEffect(() => {
        const votedComics = JSON.parse(localStorage.getItem("votedComics")) || [];
        setVotedComicsList(votedComics);
        setSelectedRating(Math.round(rating))
        
        if (votedComics.includes(comicId)) {
            setHasVoted(true);
        }
    }, []);

    function ratingHandler(value) {
        if (hasVoted) {
            alert("You have already voted for the comic! You cannot vote again.");
            return;
        }
        setSelectedRating(value);
        setHasVoted(true);
        votedComicsList.push(comicId);
        localStorage.setItem("votedComics", JSON.stringify(votedComicsList));
    }

    return (
        <>
            <div className={styles['star-container']}>
                <div className={styles['star-container__items']}>
                    {[5, 4, 3, 2, 1].map(val => (
                        <Star 
                        key={val} 
                        starValue={val} 
                        ratingHandler={ratingHandler}
                        selectedRating={selectedRating} />))}
                </div>
            </div>
            <div className={styles['rating-container']}>
                <h4 className="rating">Rating {rating}</h4>
                &nbsp;/&nbsp; 
                <h4 className="voters">{votes} votes</h4>
            </div>
        </>
    );
}