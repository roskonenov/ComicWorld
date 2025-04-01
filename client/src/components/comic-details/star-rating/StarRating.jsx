import { useComicRating, usePostComicRating } from '../../../api/comicApi';
import { useState, useEffect } from "react";
import Star from './star/Star';
import styles from './StarRating.module.css';
import usePersistedState from '../../../hooks/usePersistedState';
import { toast } from 'react-toastify';



export default function StarRating({
    ratingId,
    comicId,
}) {
    const [selectedRating, setSelectedRating] = useState(null);
    const [hasVoted, setHasVoted] = useState(false);
    const [votedComicsList, setVotedComicsList] = usePersistedState('votedComics', []);
    const { ratingData, setRatingData } = useComicRating(ratingId);

    const rating = ratingData?.value ?? 0;
    const votes = ratingData?.votes ?? 0;


    const { postRating } = usePostComicRating();

    useEffect(() => {
        setSelectedRating(Math.round(rating));

        setHasVoted(votedComicsList.includes(comicId));

    }, [comicId, rating, votedComicsList]);

    function ratingHandler(userVote) {
        if (hasVoted) {
           toast.warn("You have already voted for the comic! You cannot vote again.");
            return;
        }

        const newVotes = votes + 1;
        const newAverageRating = Number((((rating * votes) + userVote) / newVotes).toFixed(1));

        postRating(ratingId, newVotes, newAverageRating)
            .then(updatedRating => {
                setSelectedRating(Math.round(updatedRating.value));
                setHasVoted(true);
                votedComicsList.push(comicId)
                setVotedComicsList(votedComicsList);
                setRatingData(updatedRating);
            });
            toast.success("Your vote has been accepted.");
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