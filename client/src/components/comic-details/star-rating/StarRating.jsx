import { useComicRating, usePostComicRating } from '../../../api/comicApi';
import { useState, useEffect } from "react";
import Star from './star/Star';
import styles from './StarRating.module.css';



export default function StarRating({
    ratingId,
    comicId,
}) {
    const [selectedRating, setSelectedRating] = useState(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [votedComicsList, setVotedComicsList] = useState(() => {
        return JSON.parse(localStorage.getItem("votedComics")) || [];
    });

    const { ratingData } = useComicRating(ratingId);
    console.log(ratingData);

    const rating = ratingData[0]?.value ?? 0;
    const votes = ratingData[1]?.votes ?? 0;


    const { postRating, resource, loading, error } = usePostComicRating();

    useEffect(() => {
        setSelectedRating(Math.round(rating));

        setHasVoted(votedComicsList.includes(comicId));

    }, [comicId, rating, votedComicsList]);

    function ratingHandler(userVote) {
        if (hasVoted) {
            alert("You have already voted for the comic! You cannot vote again.");
            return;
        }

        const newVotes = votes + 1;
        const newAverageRating = ((rating * votes) + userVote) / newVotes;

        postRating(ratingId, newVotes, newAverageRating)
            .then(updatedRating => {
                setSelectedRating(Math.round(updatedRating));
                setHasVoted(true);
                setVotedComicsList(v => [...v, comicId])
                localStorage.setItem("votedComics", JSON.stringify(votedComicsList));
            });
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