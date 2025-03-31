import styles from './CommentSection.module.css'
import { useComments, useCreateComment, useDeleteComment, useEditComment } from '../../../api/commentsApi';
import Comment from './comment/Comment';
import Spinner from '../../spinner/Spinner';
import { useActionState, useState } from 'react';

export default function CommentSection({
    comicId,
}) {
    const [editingComment, setEditingComment] = useState(null);
    const { comments, setComments, loading } = useComments(comicId);
    const { create } = useCreateComment(setComments);
    const { remove, pending } = useDeleteComment(setComments);
    const { edit } = useEditComment(setComments);


    async function createCommentHandler(_, formData) {
        if (!formData) return;

        const text = formData.get('add-comment');

        if (editingComment) {
            await edit(editingComment._id, text);
            setEditingComment(null);
        } else {

            await create(text, comicId);
        }
    }

    function editCommentHandler(commentId) {
        const comment = comments.find(c => c._id === commentId);
        setEditingComment(comment);
    }

    function cancelEditHandler() {
        setEditingComment(null);
    }

    async function deleteCommentHandler(commentId) {
        const isConfirmed = confirm("Are you sure you want to delete the message?");
        if (!isConfirmed) {
            return;
        }
        const result = await remove(commentId);

        result._deletedOn
            ? alert("Your message has been deleted!")
            : !pending && alert(`${result.message}`)
    }

    const [_, createCommentAction] = useActionState(createCommentHandler, { 'add-comment': '' });

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
            <form
                action={createCommentAction} className={styles['add-comment-form']}>
                <textarea
                    className={styles['add-comment']}
                    name="add-comment"
                    id="add-comment"
                    rows={6}
                    cols={50}
                    required
                    defaultValue={editingComment ? editingComment.text : ''}>
                </textarea>
                <label htmlFor="add-comment">
                    {editingComment ? 'Edit your comment' : 'Comment this comic'}
                </label>
                <button
                    onClick={createCommentHandler}
                    className={styles['add-comment-button']}>
                    {editingComment ? 'Save Changes' : 'Add Comment'}
                </button>
                {editingComment && (
                    <button className={styles['cancel-button']} onClick={cancelEditHandler}>
                        Cancel
                    </button>
                )}
            </form>
        </section>
    );
}