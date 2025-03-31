import styles from './CommentSection.module.css'
import { useComments, useCreateComment, useDeleteComment, useEditComment } from '../../../api/commentsApi';
import Comment from './comment/Comment';
import Spinner from '../../spinner/Spinner';
import { useState } from 'react';
import { useUserContext } from '../../../contexts/UserContext';

export default function CommentSection({
    comicId,
}) {
    const [editingComment, setEditingComment] = useState(null);
    const [commentText, setCommentText] = useState('');
    const { comments, setComments, loading } = useComments(comicId);
    const { create } = useCreateComment(setComments);
    const { remove, pending } = useDeleteComment(setComments);
    const { edit } = useEditComment(setComments);
    const { accessToken } = useUserContext();


    async function createCommentHandler(e) {
        e.preventDefault();

        if (!commentText.trim()) return;

        if (editingComment) {
            await edit(editingComment._id, commentText);
            setEditingComment(null);
        } else {
            await create(commentText, comicId);
        }
        setCommentText("");
    }

    function editCommentHandler(commentId) {
        const comment = comments.find(c => c._id === commentId);
        setEditingComment(comment);
        setCommentText(comment.text);
    }

    function cancelEditHandler() {
        setEditingComment(null);
        setCommentText("");
    }

    async function deleteCommentHandler(commentId) {
        const isConfirmed = confirm("Are you sure you want to delete the message?");
        if (!isConfirmed) return;

        const result = await remove(commentId);

        result._deletedOn
            ? alert("Your message has been deleted!")
            : !pending && alert(`${result.message}`)
    }

    if (loading) {
        return <Spinner />
    }
    return (
        <section className={styles['comments-container']}>
            <h2 className={styles['comment-title']}>Coments</h2>
            <div className={styles['comments-wrapper']}>

                {comments.length === 0
                    ? <h2 className={styles['no-comments']}>Write the first comment for this comic.</h2>
                    : comments.map((comment, i) =>
                        <Comment
                            key={comment._id}
                            {...comment}
                            index={i}
                            onDelete={deleteCommentHandler}
                            onEdit={editCommentHandler}
                        />)}
            </div>
            {accessToken
                ? <form
                    onSubmit={createCommentHandler} className={styles['add-comment-form']}>
                    <textarea
                        className={styles['add-comment']}
                        name="add-comment"
                        id="add-comment"
                        rows={6}
                        cols={50}
                        required
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}>
                    </textarea>
                    <label htmlFor="add-comment">
                        {editingComment ? 'Edit your comment' : 'Comment this comic'}
                    </label>
                    <button
                        type='submit'
                        className={styles['add-comment-button']}>
                        {editingComment ? 'Save Changes' : 'Add Comment'}
                    </button>
                    {editingComment && (
                        <button className={styles['cancel-button']} onClick={cancelEditHandler}>
                            Cancel
                        </button>
                    )}
                </form>
                : <h3 className={styles['not-logged']}>You must be logged in to post comments.</h3>}
        </section>
    );
}